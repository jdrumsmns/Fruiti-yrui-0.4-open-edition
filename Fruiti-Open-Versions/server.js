const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const DATA_FILE = path.join(__dirname, "databank.json");
const PUBLIC_FILE = path.join(__dirname, "fruiti0.4.html");

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { accounts: [] };
  }

  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(data));
}

function publicAccount(account) {
  return {
    username: account.username,
    description: account.description || "",
    publicNotes: account.publicNotes || [],
    theme: account.theme || "light"
  };
}

function privateAccount(account) {
  return {
    username: account.username,
    description: account.description || "",
    publicNotes: account.publicNotes || [],
    privateNotes: account.privateNotes || [],
    theme: account.theme || "light"
  };
}

function readBody(request) {
  return new Promise(function (resolve, reject) {
    let body = "";

    request.on("data", function (chunk) {
      body += chunk;
    });

    request.on("end", function () {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function servePage(response) {
  const html = fs.readFileSync(PUBLIC_FILE, "utf8");
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

const server = http.createServer(async function (request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 200, {});
    return;
  }

  const url = new URL(request.url, "http://localhost:" + PORT);

  try {
    if (request.method === "GET" && url.pathname === "/") {
      servePage(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/public-accounts") {
      const data = readData();
      sendJson(response, 200, data.accounts.map(publicAccount));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/accounts") {
      sendJson(response, 200, readData().accounts);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/accounts") {
      const body = await readBody(request);
      const accounts = Array.isArray(body.accounts) ? body.accounts : [];

      writeData({ accounts: accounts });
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/signup") {
      const body = await readBody(request);
      const username = String(body.username || "").trim();
      const password = String(body.password || "").trim();
      const data = readData();

      if (!username || !password) {
        sendJson(response, 400, { message: "usuario e senha sao obrigatorios" });
        return;
      }

      if (data.accounts.some(function (account) {
        return account.username === username;
      })) {
        sendJson(response, 409, { message: "esse nome de usuario ja existe" });
        return;
      }

      const account = {
        username: username,
        password: password,
        description: "",
        publicNotes: [],
        privateNotes: [],
        theme: body.theme || "light"
      };

      data.accounts.push(account);
      writeData(data);
      sendJson(response, 201, privateAccount(account));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/login") {
      const body = await readBody(request);
      const data = readData();
      const account = data.accounts.find(function (account) {
        return account.username === String(body.username || "").trim();
      });

      if (!account || account.password !== String(body.password || "").trim()) {
        sendJson(response, 401, { message: "login invalido" });
        return;
      }

      sendJson(response, 200, privateAccount(account));
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/account/")) {
      const username = decodeURIComponent(url.pathname.replace("/api/account/", ""));
      const viewer = url.searchParams.get("viewer");
      const data = readData();
      const account = data.accounts.find(function (account) {
        return account.username === username;
      });

      if (!account) {
        sendJson(response, 404, { message: "conta nao encontrada" });
        return;
      }

      sendJson(response, 200, viewer === username ? privateAccount(account) : publicAccount(account));
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/account/")) {
      const oldUsername = decodeURIComponent(url.pathname.replace("/api/account/", ""));
      const body = await readBody(request);
      const data = readData();
      const account = data.accounts.find(function (account) {
        return account.username === oldUsername;
      });

      if (!account) {
        sendJson(response, 404, { message: "conta nao encontrada" });
        return;
      }

      if (body.username && body.username !== oldUsername) {
        const exists = data.accounts.some(function (otherAccount) {
          return otherAccount.username === body.username;
        });

        if (exists) {
          sendJson(response, 409, { message: "esse nome ja existe" });
          return;
        }

        account.username = String(body.username).trim();
      }

      if (body.description !== undefined) {
        account.description = String(body.description);
      }

      if (body.theme !== undefined) {
        account.theme = String(body.theme);
      }

      if (body.publicNotes) {
        account.publicNotes = body.publicNotes.map(String);
      }

      if (body.privateNotes) {
        account.privateNotes = body.privateNotes.map(String);
      }

      writeData(data);
      sendJson(response, 200, privateAccount(account));
      return;
    }

    sendJson(response, 404, { message: "rota nao encontrada" });
  } catch (error) {
    sendJson(response, 500, { message: "erro no servidor", detail: error.message });
  }
});

server.listen(PORT, HOST, function () {
  console.log("Fruiti 0.4 rodando em http://localhost:" + PORT);
  console.log("Para aparecer fora da sua rede, hospede este servidor em um host publico.");
});
