import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const maxBodyBytes = 32_000;
const providers = {
  openai: {
    key: () => process.env.OPENAI_API_KEY,
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    label: 'OpenAI'
  },
  xai: {
    key: () => process.env.XAI_API_KEY,
    endpoint: 'https://api.x.ai/v1/chat/completions',
    model: process.env.XAI_MODEL || 'grok-3-mini-fast',
    label: 'xAI'
  }
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBodyBytes) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request must contain valid JSON.'), { status: 400 });
  }
}

function validateMessages(body) {
  if (!body || typeof body !== 'object' || typeof body.message !== 'string') {
    throw Object.assign(new Error('A message is required.'), { status: 400 });
  }
  const message = body.message.trim();
  if (!message || message.length > 2000) {
    throw Object.assign(new Error('Message must contain 1 to 2000 characters.'), { status: 400 });
  }
  const history = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  const messages = history.map((item) => {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') {
      throw Object.assign(new Error('Conversation history is invalid.'), { status: 400 });
    }
    return { role: item.role, content: item.content.slice(0, 4000) };
  });
  if (!messages.some((item) => item.role === 'user' && item.content.trim() === message)) {
    messages.push({ role: 'user', content: message });
  }
  return messages;
}

const systemPrompt = `You are a helpful assistant for Lakshay Batra's personal portfolio. Answer accurately using only these published facts: Lakshay is a second-year B.Tech Computer Science and Engineering (AI/ML) student at JECRC University. His listed learning interests include Artificial Intelligence, Machine Learning, Python, Data Science, Web Development, Generative AI, programming, prompt engineering, Git and GitHub, AI-assisted development, and problem-solving; these are interests, not confirmed proficiency. Four public Python repositories are featured: correcting-grade-25BCON1007 (a student grade report exercise in messy_py.py; README test claims mention files that were not present in the inspected repository listing), 1.-python-basics-25BCON1007-fibonacci (prints 10 Fibonacci values), python-basics-25BCON1007-struct-to-dict (prints a fixed student dictionary record), and python-basic-25bcon1007 (untitled1.py calculates factorial from integer input; README claims about NumPy and validation are not supported by source). Do not invent experience, awards, certificates, skills, projects, project details, or links. If asked about something not published here, say it is not listed.`;

async function handleChat(request, response, providerId) {
  const provider = providers[providerId];
  const apiKey = provider.key();
  if (!apiKey) {
    sendJson(response, 503, { error: `${provider.label} is not configured. Add its API key to the server environment and restart.` });
    return;
  }

  const body = await readJson(request);
  const messages = validateMessages(body);
  let upstream;
  try {
    upstream = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.6,
        max_tokens: 700
      }),
      signal: AbortSignal.timeout(30_000)
    });
  } catch {
    sendJson(response, 502, { error: `${provider.label} could not be reached. Please try again.` });
    return;
  }

  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const status = upstream.status === 401 || upstream.status === 403 ? 502 : 503;
    sendJson(response, status, { error: `${provider.label} returned an error. Check server configuration or retry shortly.` });
    return;
  }
  const answer = payload.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) {
    sendJson(response, 502, { error: `${provider.label} returned an empty response. Please retry.` });
    return;
  }
  sendJson(response, 200, { response: answer.trim(), provider: providerId, mode: 'live' });
}

async function serveStatic(pathname, response) {
  const decoded = decodeURIComponent(pathname);
  const relativePath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  if (relativePath !== 'index.html') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  const filePath = resolve(root, relativePath);
  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    response.end(contents);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/api/chat/status') {
    sendJson(response, 200, {
      providers: {
        openai: Boolean(process.env.OPENAI_API_KEY),
        xai: Boolean(process.env.XAI_API_KEY)
      }
    });
    return;
  }

  const chatMatch = url.pathname.match(/^\/api\/chat\/(openai|xai)$/);
  if (request.method === 'POST' && chatMatch) {
    try {
      await handleChat(request, response, chatMatch[1]);
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.status ? error.message : 'The AI service could not complete the request.' });
    }
    return;
  }

  if (request.method === 'GET') {
    await serveStatic(url.pathname, response);
    return;
  }
  response.writeHead(405, { Allow: 'GET, POST' }).end('Method not allowed');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Portfolio and AI playground running at http://127.0.0.1:${port}`);
  console.log(`Provider mode: OpenAI ${process.env.OPENAI_API_KEY ? 'configured' : 'demo'} · xAI ${process.env.XAI_API_KEY ? 'configured' : 'demo'}`);
});
