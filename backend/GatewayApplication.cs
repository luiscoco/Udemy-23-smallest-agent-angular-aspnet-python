using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.StaticFiles;

namespace SmallestAgent;

public record GatewaySettings(string Url, string Token, string StaticRoot, string ListenUrl, bool TrustProxy = false);

public static class GatewayApplication
{
    public static WebApplication Create(string[] args, GatewaySettings? settings = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = args, ContentRootPath = Directory.GetCurrentDirectory() });
        // Load the dotfile directly: physical configuration file providers can exclude dot-prefixed files.
        var environmentFile = Path.Combine(builder.Environment.ContentRootPath, ".env");
        if (File.Exists(environmentFile))
        {
            using var environmentStream = File.OpenRead(environmentFile);
            builder.Configuration.AddIniStream(environmentStream);
        }
        builder.Configuration.AddEnvironmentVariables();
        if (settings is not null) builder.Logging.ClearProviders();
        settings ??= new GatewaySettings(
            builder.Configuration["AGENT_SERVICE_URL"] ?? "http://127.0.0.1:9801",
            builder.Configuration["AGENT_SERVICE_TOKEN"] ?? "",
            Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "../frontend/dist/browser")),
            $"http://{builder.Configuration["API_HOST"] ?? "127.0.0.1"}:{builder.Configuration["API_PORT"] ?? "9800"}",
            builder.Configuration["TRUST_PROXY"] == "1");
        if (!Uri.TryCreate(settings.Url, UriKind.Absolute, out var serviceUri) || serviceUri.Scheme is not ("http" or "https")
            || !string.IsNullOrEmpty(serviceUri.UserInfo) || serviceUri.AbsolutePath != "/" || serviceUri.Query != "" || serviceUri.Fragment != "")
            throw new InvalidOperationException("Invalid private Python service origin.");
        if (settings.Token.Length < 32 || settings.Token.StartsWith("replace-"))
            throw new InvalidOperationException("Run npm run setup to create matching private service tokens.");
        builder.WebHost.UseUrls(settings.ListenUrl);
        builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 65536);
        builder.Services.AddSingleton(settings);
        builder.Services.AddHttpClient("agent", client => { client.BaseAddress = serviceUri; client.Timeout = Timeout.InfiniteTimeSpan; })
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false, ConnectTimeout = TimeSpan.FromSeconds(10) });
        var app = builder.Build();
        app.UseExceptionHandler(branch => branch.Run(context => Error(context, 500, "The gateway could not process this request.")));
        app.MapGet("/api/health", async (HttpContext context, IHttpClientFactory factory) => await Relay(context, factory, settings, "/api/health", null));
        app.MapPost("/api/agent/query", async (HttpContext context, IHttpClientFactory factory) => await Agent(context, factory, settings, "/api/agent/query"));
        app.MapPost("/api/agent/stream", async (HttpContext context, IHttpClientFactory factory) => await Agent(context, factory, settings, "/api/agent/stream"));
        app.MapGet("/api/docs", () => Results.Content(Docs, "text/html"));
        app.MapGet("/api/openapi.json", () => Results.File(Path.Combine(app.Environment.ContentRootPath, "openapi.json"), "application/json"));
        app.MapFallback("/{**path}", async context => {
            if (context.Request.Method != "GET" || context.Request.Path.StartsWithSegments("/api") || !await Static(context, settings.StaticRoot))
                await Error(context, 404, "Not found.");
        });
        return app;
    }

    private static async Task Agent(HttpContext context, IHttpClientFactory factory, GatewaySettings settings, string path)
    {
        try
        {
            var prompt = await ValidatePrompt(context, settings);
            await Relay(context, factory, settings, path, prompt);
        }
        catch (InputError error) { await Error(context, error.Status, error.Message); }
        catch (BadHttpRequestException error) { await Error(context, error.StatusCode == 413 ? 413 : 400, "Invalid request body."); }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
    }

    public static async Task<string> ValidatePrompt(HttpContext context, GatewaySettings settings)
    {
        var request = context.Request;
        var scheme = settings.TrustProxy && request.Headers["X-Forwarded-Proto"] == "https" ? "https" : request.Scheme;
        var origin = request.Headers.Origin.ToString();
        if (origin.Length > 0 && origin != $"{scheme}://{request.Host}") throw new InputError(403, "Origin is not allowed.");
        if (!MediaTypeHeaderValue.TryParse(request.ContentType, out var media) || !string.Equals(media.MediaType, "application/json", StringComparison.OrdinalIgnoreCase))
            throw new InputError(415, "Use Content-Type: application/json.");
        using var body = new MemoryStream();
        var buffer = new byte[8192];
        int count;
        while ((count = await request.Body.ReadAsync(buffer, context.RequestAborted)) > 0)
        {
            if (body.Length + count > 32768) throw new InputError(413, "Request body exceeds 32 KiB.");
            body.Write(buffer, 0, count);
        }
        try
        {
            using var json = JsonDocument.Parse(body.ToArray());
            if (json.RootElement.ValueKind != JsonValueKind.Object || !json.RootElement.TryGetProperty("prompt", out var value) || value.ValueKind != JsonValueKind.String)
                throw new InputError(422, "Provide a prompt string of 1–4000 characters.");
            var prompt = value.GetString()!.Trim();
            if (prompt.Length is < 1 or > 4000) throw new InputError(422, "Provide a prompt string of 1–4000 characters.");
            return prompt;
        }
        catch (JsonException) { throw new InputError(400, "Request must contain valid JSON."); }
    }

    private static async Task Relay(HttpContext context, IHttpClientFactory factory, GatewaySettings settings, string path, string? prompt)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
        deadline.CancelAfter(TimeSpan.FromSeconds(185));
        using var outgoing = new HttpRequestMessage(prompt is null ? HttpMethod.Get : HttpMethod.Post, path);
        outgoing.Headers.Add("X-Agent-Service-Token", settings.Token);
        // Only our token and normalized JSON travel upstream; browser cookies/headers do not.
        if (prompt is not null) outgoing.Content = new StringContent(JsonSerializer.Serialize(new { prompt }), Encoding.UTF8, "application/json");
        try
        {
            using var client = factory.CreateClient("agent");
            using var response = await client.SendAsync(outgoing, HttpCompletionOption.ResponseHeadersRead, deadline.Token);
            var status = (int)response.StatusCode;
            if (status == 401 || status is >= 300 and < 400) { await Error(context, 503, "Python agent service unavailable. Check server configuration."); return; }
            context.Response.StatusCode = status;
            context.Response.ContentType = response.Content.Headers.ContentType?.ToString() ?? "application/json";
            if (path.EndsWith("/stream") && status == 200)
            {
                context.Response.Headers.CacheControl = "no-cache, no-transform";
                context.Response.Headers["X-Accel-Buffering"] = "no";
            }
            await context.Response.StartAsync(deadline.Token);
            await using var source = await response.Content.ReadAsStreamAsync(deadline.Token);
            var buffer = new byte[16384];
            int count;
            while ((count = await source.ReadAsync(buffer, deadline.Token)) > 0)
            {
                await context.Response.Body.WriteAsync(buffer.AsMemory(0, count), deadline.Token);
                await context.Response.Body.FlushAsync(deadline.Token);
            }
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or IOException)
        {
            if (context.RequestAborted.IsCancellationRequested) return;
            if (!context.Response.HasStarted) await Error(context, 503, "Python agent service unavailable. Check server configuration.");
            else context.Abort();
        }
    }

    private static async Task<bool> Static(HttpContext context, string directory)
    {
        var path = context.Request.Path.Value ?? "/";
        if (path.Contains('\\') || path.Contains('\0') || path.Split('/').Any(part => part.StartsWith('.'))) return false;
        if (!Directory.Exists(directory)) return false;
        var rootInfo = new DirectoryInfo(Path.GetFullPath(directory));
        var root = (rootInfo.ResolveLinkTarget(true) ?? rootInfo).FullName.TrimEnd(Path.DirectorySeparatorChar);
        var current = root;
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        try
        {
            foreach (var part in (path == "/" ? "index.html" : path.TrimStart('/')).Split('/'))
            {
                if (part.Length == 0) continue;
                var candidate = Path.Combine(current, part);
                FileSystemInfo info = Directory.Exists(candidate) ? new DirectoryInfo(candidate) : new FileInfo(candidate);
                current = (info.ResolveLinkTarget(true) ?? info).FullName;
                if (!current.StartsWith(root + Path.DirectorySeparatorChar, comparison)) return false;
            }
            if (!File.Exists(current)) return false;
            new FileExtensionContentTypeProvider().TryGetContentType(current, out var type);
            await Results.File(current, type ?? "application/octet-stream").ExecuteAsync(context);
            return true;
        }
        catch (IOException) { return false; }
    }

    public static Task Error(HttpContext context, int status, string detail) => Results.Json(new { detail }, statusCode: status).ExecuteAsync(context);
    public sealed class InputError(int status, string message) : Exception(message) { public int Status { get; } = status; }
    private const string Docs = """
        <!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ASP.NET Core Agent API</title>
        <style>body{font:21px/1.6 system-ui;max-width:1000px;margin:2rem auto;padding:1rem;background:#edf5ff;color:#142547}code{background:#fff;padding:.2rem}</style>
        <h1>Angular + ASP.NET Core + Python Agent</h1><p>GET /api/health · POST /api/agent/query · POST /api/agent/stream</p>
        <p>JSON: <code>{"prompt":"Hello world!"}</code>; trimmed 1–4000 characters, actual body ≤32KiB.</p>
        <p>Private Python owns the model key. Gateway attaches its internal token, validates input and flushes real SSE chunks.</p>
        <p><a href="/api/openapi.json">OpenAPI JSON</a> · <a href="/">Angular application</a></p></html>
        """;
}
