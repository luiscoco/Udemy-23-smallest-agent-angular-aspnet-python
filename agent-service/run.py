"""Module-relative configuration and a subprocess-capable Windows event loop."""
import asyncio
import os
import sys
from pathlib import Path
import uvicorn
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / '.env', override=False)
sys.path.insert(0, str(Path(__file__).resolve().parent))
if __name__ == '__main__':
    config = uvicorn.Config('app.main:app', host=os.getenv('AGENT_HOST', '127.0.0.1'), port=int(os.getenv('AGENT_PORT', '9801')), loop='none', proxy_headers=False, timeout_graceful_shutdown=8)
    server = uvicorn.Server(config)
    factory = asyncio.ProactorEventLoop if sys.platform == 'win32' else asyncio.new_event_loop
    with asyncio.Runner(loop_factory=factory) as runner:
        runner.run(server.serve())
