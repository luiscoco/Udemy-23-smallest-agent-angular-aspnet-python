using System.Net;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SmallestAgent;

const string Token = "test-internal-token-0123456789-abcdefghijklmnopqrstuvwxyz";
var directory = Path.Combine(Path.GetTempPath(), "smallest-agent-23-tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(directory);File.WriteAllText(Path.Combine(directory,"index.html"),"<main>Angular</main>");File.WriteAllText(Path.Combine(directory,".env"),"private");
File.WriteAllText(Path.Combine(directory,"app.js"),"console.log('Angular')");
var builder = WebApplication.CreateBuilder();builder.Logging.ClearProviders();builder.WebHost.UseUrls("http://127.0.0.1:0");
await using var upstream = builder.Build();
int calls = 0;string? receivedToken = null,receivedCookie = null,receivedOrigin = null,receivedBody = null;int upstreamStatus=200;
var disconnected = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
upstream.MapGet("/api/health", async context => {calls++;if(upstreamStatus!=200){context.Response.StatusCode=upstreamStatus;await context.Response.WriteAsync("private diagnostic");return;}await context.Response.WriteAsJsonAsync(new {status="ok",api_key_configured=false});});
upstream.MapPost("/api/agent/query", async context => {calls++;receivedToken=context.Request.Headers["X-Agent-Service-Token"];receivedCookie=context.Request.Headers.Cookie;receivedOrigin=context.Request.Headers.Origin;receivedBody=await new StreamReader(context.Request.Body).ReadToEndAsync();await context.Response.WriteAsJsonAsync(new {result="hello",num_turns=1,duration_ms=1,total_cost_usd=(double?)null,is_error=false});});
upstream.MapPost("/api/agent/stream", async context => {
    context.Response.ContentType="text/event-stream";await context.Response.WriteAsync("event: message\ndata: {\"type\":\"SystemMessage\"}\n\n");await context.Response.Body.FlushAsync();
    try {await Task.Delay(TimeSpan.FromSeconds(20),context.RequestAborted);}catch(OperationCanceledException){disconnected.TrySetResult();}
});
await upstream.StartAsync();
string Address(WebApplication app)=>app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
await using var gateway = GatewayApplication.Create([],new GatewaySettings(Address(upstream),Token,directory,"http://127.0.0.1:0"));await gateway.StartAsync();
using var http = new HttpClient {BaseAddress=new Uri(Address(gateway)),Timeout=TimeSpan.FromSeconds(10)};
void Assert(bool condition,string message){if(!condition)throw new Exception(message);}
async Task<HttpResponseMessage> Post(string json,string? origin=null,string media="application/json") {
    using var request=new HttpRequestMessage(HttpMethod.Post,"/api/agent/query"){Content=new StringContent(json,Encoding.UTF8,media)};
    request.Headers.Add("X-Agent-Service-Token","browser-spoof");request.Headers.Add("Cookie","private=browser");if(origin!=null)request.Headers.Add("Origin",origin);
    return await http.SendAsync(request);
}
int passed=0;
try {
    foreach(var json in new[]{"{}","{\"prompt\":42}","{\"prompt\":\"  \"}","{\"prompt\":\""+new string('x',4001)+"\"}"}){using var response=await Post(json);Assert((int)response.StatusCode==422,"Invalid prompt reached upstream");}Assert(calls==0,"Validation contacted Python");passed++;
    using(var response=await Post("{\"prompt\":\""+new string('x',40000)+"\"}"))Assert((int)response.StatusCode==413,"Actual byte bound failed");passed++;
    using(var response=await Post("{\"prompt\":\"hi\"}","https://foreign.invalid"))Assert(response.StatusCode==HttpStatusCode.Forbidden,"Origin bypass");using(var response=await Post("{}",null,"text/plain"))Assert((int)response.StatusCode==415,"Media bypass");passed++;
    using(var response=await Post("{\"prompt\":\" hello \",\"ignored\":\"value\"}",Address(gateway)))Assert(response.IsSuccessStatusCode,"Valid request failed");Assert(receivedToken==Token&&string.IsNullOrEmpty(receivedCookie)&&string.IsNullOrEmpty(receivedOrigin),"Browser headers leaked");Assert(receivedBody=="{\"prompt\":\"hello\"}","Prompt not normalized");passed++;
    using(var request=new HttpRequestMessage(HttpMethod.Post,"/api/agent/stream"){Content=new StringContent("{\"prompt\":\"hello\"}",Encoding.UTF8,"application/json")})
    using(var cancel=new CancellationTokenSource(TimeSpan.FromSeconds(5)))
    using(var response=await http.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,cancel.Token))
    {using var stream=await response.Content.ReadAsStreamAsync(cancel.Token);var bytes=new byte[1024];var count=await stream.ReadAsync(bytes,cancel.Token);Assert(Encoding.UTF8.GetString(bytes,0,count).Contains("event: message"),"SSE buffered instead of streamed");cancel.Cancel();}
    await disconnected.Task.WaitAsync(TimeSpan.FromSeconds(5));passed++;
    foreach(var path in new[]{"/.env","/api/unknown","/missing.js"})Assert((await http.GetAsync(path)).StatusCode==HttpStatusCode.NotFound,"Unsafe static/API route");Assert(await http.GetStringAsync("/")=="<main>Angular</main>","Compiled UI not served");Assert(await http.GetStringAsync("/app.js")=="console.log('Angular')","Compiled JavaScript asset not served");passed++;
    foreach(var status in new[]{401,302}){upstreamStatus=status;using var response=await http.GetAsync("/api/health");Assert((int)response.StatusCode==503,"Private auth/redirect was forwarded");Assert(!(await response.Content.ReadAsStringAsync()).Contains("private diagnostic"),"Private error leaked");}passed++;
    Console.WriteLine($"ASP.NET Core integration checks passed: {passed}. Real HTTP validation, handoff, progressive SSE/cancellation and static boundaries.");
}finally {await gateway.StopAsync();await upstream.StopAsync();File.Delete(Path.Combine(directory,"index.html"));File.Delete(Path.Combine(directory,"app.js"));File.Delete(Path.Combine(directory,".env"));Directory.Delete(directory);}
