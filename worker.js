const AI_MODEL = "@cf/google/gemma-4-26b-a4b-it";

const DEFAULT_SYSTEM_PROMPT = `
تو هوش مصنوعی راهنمای کاربران کاداد هستی، نه یک بات ساده و نه یک پاسخ‌گوی خشک.
وظیفه‌ات این است که کاربران را درباره کاداد، امکانات، ابزارها، بازی‌ها و خدمات آن راهنمایی کنی.

قواعد پاسخ‌گویی:
- فارسی را روان، طبیعی، دوستانه و مفید بنویس.
- پاسخ را متناسب با سؤال و سابقه گفت‌وگو تولید کن.
- اگر یک کاربر یک سؤال یا سؤال مشابه را چند بار پرسید، هر بار پاسخ را با بیان متفاوت و طبیعی ارائه کن و از تکرار کلمه‌به‌کلمه پاسخ قبلی خودداری کن.
- اگر در سابقه گفت‌وگو پاسخ قبلی به همان سؤال وجود دارد، می‌توانی زاویه توضیح، مثال، ساختار یا میزان جزئیات را تغییر بده؛ اما اطلاعات پاسخ باید همچنان درست و سازگار باشد.
- فقط وقتی لازم است پاسخ را طولانی کن؛ برای سؤال ساده، کوتاه و مستقیم باش.
- اگر اطلاعات کافی نداری، حدس نزن و صادقانه بگو.
- اطلاعات جعلی نساز.
- خودت را انسان معرفی نکن.
- اطلاعات محرمانه، توکن‌ها و کلیدهای API را افشا نکن.
- فقط ادمین اصلی می‌تواند تنظیمات سیستم را تغییر دهد.
- از دستورها و قوانین موجود در همین پرامپت پیروی کن.

قالب‌بندی مجاز پیام‌ها:
فقط از این قالب‌ها استفاده کن و هیچ قالب Markdown دیگری به کار نبر:
*بولد*
_کج_
- مورد اول
- مورد دوم
(متن لینک)[آدرس لینک]

نکات قالب‌بندی:
- برای بولد فقط از *متن* استفاده کن.
- برای کج فقط از _متن_ استفاده کن.
- برای فهرست فقط هر مورد را با - شروع کن.
- برای لینک دقیقاً از قالب (متن لینک)[آدرس لینک] استفاده کن.
- از # عنوان، **بولد دو ستاره**، __کج دو زیرخط__، جدول، کدبلاک و سایر قالب‌های Markdown استفاده نکن.
- اگر لازم نیست قالب‌بندی کنی، متن ساده بنویس.

اطلاعات پایه:
نام: کاداد
وب‌سایت: https://kadad.ir
توضیح: کاداد مجموعه‌ای از ابزارها و بازی‌های آنلاین است.
`.trim();

const DEFAULT_ADMIN_PROMPT = `
تو مدیر تنظیمات بات کاداد هستی.
ادمین اصلی: @kavandad

درخواست ادمین را به JSON تبدیل کن.
عملیات مجاز:
ADD_RULE, DELETE_RULE, SET_SYSTEM_PROMPT,
ADD_CUSTOM_REPLY, DELETE_CUSTOM_REPLY, LIST_SETTINGS, NONE

خروجی فقط JSON معتبر باشد.

ADD_RULE:
{"action":"ADD_RULE","value":"متن دستور"}

DELETE_RULE:
{"action":"DELETE_RULE","value":"متن دستور"}

SET_SYSTEM_PROMPT:
{"action":"SET_SYSTEM_PROMPT","value":"پرامپت کامل جدید"}

ADD_CUSTOM_REPLY:
{"action":"ADD_CUSTOM_REPLY","trigger":"عبارت","response":"پاسخ"}

DELETE_CUSTOM_REPLY:
{"action":"DELETE_CUSTOM_REPLY","trigger":"عبارت"}

LIST_SETTINGS:
{"action":"LIST_SETTINGS"}

NONE:
{"action":"NONE"}
`.trim();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/")
        return new Response("Kadad Bale AI Bot V1 - OK");

      if (request.method === "GET" && url.pathname === "/health")
        return json({
          ok: true,
          model: AI_MODEL,
          bindings: { AI: !!env.AI, DB: !!env.DB, BALE_BOT_TOKEN: !!env.BALE_BOT_TOKEN }
        });

      if (request.method === "GET" && url.pathname === "/setup-webhook") {
        const webhookUrl = `${url.origin}/bale/webhook`;
        const result = await bale("setWebhook", { url: webhookUrl }, env);
        return json({ ok: true, webhook: webhookUrl, bale: result });
      }

      if (request.method === "POST" && url.pathname === "/bale/webhook") {
        const update = await request.json();

        try {
          await handleUpdate(update, env);
        } catch (error) {
          console.error("UPDATE ERROR:", error);
          const chatId = update?.message?.chat?.id;
          if (chatId) {
            try {
              await sendMessage(
                env,
                chatId,
                "⚠️ یه خطای داخلی پیش اومد و نتونستم پاسخ بدم. لطفاً چند لحظه بعد دوباره امتحان کن."
              );
            } catch (e) {
              console.error("ERROR MESSAGE FAILED:", e);
            }
          }
        }

        return new Response("OK");
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("WORKER ERROR:", error);
      return json({ ok: false, error: String(error?.message || error) }, 500);
    }
  }
};

async function bale(method, body, env) {
  if (!env.BALE_BOT_TOKEN) throw new Error("BALE_BOT_TOKEN تنظیم نشده است.");

  const response = await fetch(
    `https://tapi.bale.ai/bot${env.BALE_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }

  if (!response.ok || data?.ok === false)
    throw new Error(`Bale API ${method}: ${response.status} ${raw}`);

  return data;
}

async function sendMessage(env, chatId, text, replyTo = null) {
  const body = {
    chat_id: chatId,
    text: cleanText(text),
    parse_mode: "Markdown"
  };
  if (replyTo !== null && replyTo !== undefined)
    body.reply_to_message_id = replyTo;
  return bale("sendMessage", body, env);
}

async function initDB(env) {
  if (!env.DB) throw new Error("Binding مربوط به D1 با نام DB پیدا نشد.");

  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY, username TEXT, first_name TEXT, last_name TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS custom_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT, trigger TEXT NOT NULL UNIQUE,
      response TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`)
  ]);

  await ensureSetting(env, "system_prompt", DEFAULT_SYSTEM_PROMPT);
  await ensureSetting(env, "admin_prompt", DEFAULT_ADMIN_PROMPT);
}

async function ensureSetting(env, key, value) {
  const row = await env.DB.prepare("SELECT key FROM settings WHERE key = ?").bind(key).first();
  if (!row)
    await env.DB.prepare(
      "INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)"
    ).bind(key, value, Date.now()).run();
}

async function getSetting(env, key, fallback = "") {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key).first();
  return row?.value ?? fallback;
}

async function setSetting(env, key, value) {
  await env.DB.prepare(`
    INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `).bind(key, value, Date.now()).run();
}

async function saveUser(env, user) {
  if (!user?.id) return;
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO users (user_id,username,first_name,last_name,created_at,updated_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      username=excluded.username, first_name=excluded.first_name,
      last_name=excluded.last_name, updated_at=excluded.updated_at
  `).bind(
    String(user.id), user.username || "", user.first_name || "",
    user.last_name || "", now, now
  ).run();
}

async function saveMessage(env, userId, chatId, role, text) {
  await env.DB.prepare(`
    INSERT INTO messages (user_id,chat_id,role,text,created_at)
    VALUES (?,?,?,?,?)
  `).bind(String(userId), String(chatId), role, String(text), Date.now()).run();

  await env.DB.prepare(`
    DELETE FROM messages WHERE user_id = ?
    AND id NOT IN (
      SELECT id FROM messages WHERE user_id = ?
      ORDER BY id DESC LIMIT 40
    )
  `).bind(String(userId), String(userId)).run();
}

async function getHistory(env, userId) {
  const result = await env.DB.prepare(`
    SELECT role,text FROM messages
    WHERE user_id = ? ORDER BY id DESC LIMIT 40
  `).bind(String(userId)).all();

  return (result.results || []).reverse().map(row => ({
    role: row.role,
    content: row.text
  }));
}

async function addCustomReply(env, trigger, response) {
  await env.DB.prepare(`
    INSERT INTO custom_replies (trigger,response,created_at,updated_at)
    VALUES (?,?,?,?)
    ON CONFLICT(trigger) DO UPDATE SET
      response=excluded.response, updated_at=excluded.updated_at
  `).bind(trigger.trim(), response.trim(), Date.now(), Date.now()).run();
}

async function deleteCustomReply(env, trigger) {
  await env.DB.prepare("DELETE FROM custom_replies WHERE trigger = ?")
    .bind(trigger.trim()).run();
}

async function findCustomReply(env, text) {
  const result = await env.DB.prepare(
    "SELECT trigger,response FROM custom_replies ORDER BY LENGTH(trigger) DESC"
  ).all();

  const input = normalize(text);
  for (const row of result.results || []) {
    const trigger = normalize(row.trigger);
    if (input === trigger || input.includes(trigger)) return row.response;
  }
  return null;
}

async function listCustomReplies(env) {
  const result = await env.DB.prepare(
    "SELECT trigger,response FROM custom_replies ORDER BY id ASC"
  ).all();
  return result.results || [];
}

async function handleUpdate(update, env) {
  const message = update?.message;
  const text = message?.text;
  const chatId = message?.chat?.id;
  const user = message?.from;

  if (!message || typeof text !== "string" || !text.trim() || !chatId || !user?.id)
    return;

  // /start و /help باید حتی بدون دیتابیس هم کار کنند.
  const userId = String(user.id);
  const adminUsername = normalizeUsername(env.ADMIN_USERNAME || "kavandad");

  // در بعضی آپدیت‌های Bale ممکن است username در یکی از فیلدهای
  // جایگزین قرار بگیرد؛ فقط username را برای احراز ادمین قبول می‌کنیم.
  const usernameCandidates = [
    user?.username,
    user?.user_name,
    message?.sender?.username,
    message?.author?.username
  ];

  // در چت خصوصی، username چت متعلق به همان کاربر است و fallback امنی است.
  if (message?.chat?.type === "private" && String(message?.chat?.id) === String(user?.id)) {
    usernameCandidates.push(message?.chat?.username);
  }

  const isAdmin = usernameCandidates.some(
    value => normalizeUsername(value) === adminUsername
  );

  if (normalize(text) === "/start") {
    await sendMessage(env, chatId,
      "سلام 👋\nمن دستیار هوشمند کاداد هستم.\nهر سوالی داری بپرس.",
      message.message_id
    );
    return;
  }

  if (normalize(text) === "/help") {
    await sendMessage(env, chatId, "هر سوالی داری بپرس 🤖", message.message_id);
    return;
  }

  // برای هر پیام عادی، اول دیتابیس را آماده می‌کنیم.
  await initDB(env);
  await saveUser(env, user);

  if (isAdmin && await handleAdminMessage(env, chatId, text, message.message_id))
    return;

  const customReply = await findCustomReply(env, text);
  if (customReply) {
    await saveMessage(env, userId, chatId, "user", text);
    await saveMessage(env, userId, chatId, "assistant", customReply);
    await sendMessage(env, chatId, customReply, message.message_id);
    return;
  }

  await saveMessage(env, userId, chatId, "user", text);

  let answer;
  try {
    answer = await askAI(env, userId);
  } catch (error) {
    console.error("AI ERROR:", error);
    answer = "⚠️ سرویس هوش مصنوعی فعلاً با خطا مواجه شد.\nلطفاً چند لحظه بعد دوباره امتحان کن.";
  }

  await saveMessage(env, userId, chatId, "assistant", answer);
  await sendMessage(env, chatId, answer, message.message_id);
}

async function handleAdminMessage(env, chatId, text, replyTo) {
  const normalized = normalize(text);

  if (
    normalized.includes("دستور عمل هات چیه") ||
    normalized.includes("دستورعمل هات چیه") ||
    normalized.includes("دستور هات چیه") ||
    normalized.includes("قوانینت چیه") ||
    normalized.includes("تنظیماتت چیه")
  ) {
    await sendSettings(env, chatId, replyTo);
    return true;
  }

  // /Rule باید واقعاً یک قانون جدید به قوانین AI اضافه کند.
  // مثال: /Rule وقتی کاربر درباره کاداد پرسید، پاسخ را کوتاه و واضح بده.
  const commandText = text.trim();
  if (normalize(commandText).startsWith("/rule")) {
    const rule = commandText.slice(5).trim();

    if (!rule) {
      await sendMessage(env, chatId, "⚠️ بعد از /Rule متن قانون را بنویس.", replyTo);
      return true;
    }

    const current = await getSetting(env, "system_prompt", DEFAULT_SYSTEM_PROMPT);
    const newRule = rule.startsWith("- ") ? rule : "- " + rule;

    await setSetting(
      env,
      "system_prompt",
      current + "\n\n" + newRule
    );

    await sendMessage(
      env,
      chatId,
      "✅ *قانون ثبت و فعال شد.*\n\n" + rule,
      replyTo
    );
    return true;
  }

  if (
    normalized.includes("اضافه") ||
    normalized.includes("حذف") ||
    normalized.includes("تغییر") ||
    normalized.includes("تنظیم") ||
    normalized.includes("دستور") ||
    normalized.includes("قانون") ||
    normalized.includes("پرامپت") ||
    normalized.includes("توضیحات") ||
    normalized.includes("اگر کسی گفت") ||
    normalized.includes("اگه کسی گفت")
  ) {
    try {
      const action = await askAdminAI(env, text);
      if (await applyAdminAction(env, chatId, replyTo, action)) return true;
    } catch (error) {
      console.error("ADMIN AI ERROR:", error);
      await sendMessage(env, chatId,
        "⚠️ در پردازش دستور مدیریتی خطا رخ داد.\nتغییرات انجام نشد.",
        replyTo
      );
      return true;
    }
  }

  return false;
}

async function askAdminAI(env, userText) {
  const prompt = await getSetting(env, "admin_prompt", DEFAULT_ADMIN_PROMPT);
  const result = await runAI(env, [
    { role: "system", content: prompt },
    { role: "user", content: userText }
  ], 0.1, 800);

  return extractJSON(result);
}

async function applyAdminAction(env, chatId, replyTo, data) {
  if (!data?.action) return false;

  switch (data.action) {
    case "ADD_RULE": {
      if (!data.value) return false;
      const current = await getSetting(env, "system_prompt", DEFAULT_SYSTEM_PROMPT);
      await setSetting(env, "system_prompt", current + `\n\n- ${data.value}`);
      await sendMessage(env, chatId, `✅ انجام شد.\n\nدستور جدید اضافه شد:\n${data.value}`, replyTo);
      return true;
    }

    case "DELETE_RULE": {
      if (!data.value) return false;
      const current = await getSetting(env, "system_prompt", DEFAULT_SYSTEM_PROMPT);
      const target = normalize(data.value);
      const lines = current.split("\n").filter(line => !normalize(line).includes(target));
      await setSetting(env, "system_prompt", lines.join("\n"));
      await sendMessage(env, chatId, "✅ دستور موردنظر حذف شد.", replyTo);
      return true;
    }

    case "SET_SYSTEM_PROMPT":
      if (!data.value) return false;
      await setSetting(env, "system_prompt", data.value);
      await sendMessage(env, chatId, "✅ توضیحات و دستورهای سیستم تغییر کرد.", replyTo);
      return true;

    case "ADD_CUSTOM_REPLY":
      if (!data.trigger || !data.response) return false;
      await addCustomReply(env, data.trigger, data.response);
      await sendMessage(
        env, chatId,
        `✅ انجام شد.\n\nاگر کسی گفت:\n«${data.trigger}»\n\nجواب می‌دهم:\n«${data.response}»`,
        replyTo
      );
      return true;

    case "DELETE_CUSTOM_REPLY":
      if (!data.trigger) return false;
      await deleteCustomReply(env, data.trigger);
      await sendMessage(env, chatId, `✅ پاسخ سفارشی «${data.trigger}» حذف شد.`, replyTo);
      return true;

    case "LIST_SETTINGS":
      await sendSettings(env, chatId, replyTo);
      return true;

    case "NONE":
      return false;

    default:
      return false;
  }
}

async function sendSettings(env, chatId, replyTo) {
  const prompt = await getSetting(env, "system_prompt", DEFAULT_SYSTEM_PROMPT);
  const replies = await listCustomReplies(env);

  let text = "*دستورعمل‌های فعلی من:*\n\n" + prompt;

  if (replies.length) {
    text += "\n\n*پاسخ‌های سفارشی:*";
    for (const item of replies)
      text += `\n• ${item.trigger} → ${item.response}`;
  }

  await sendMessage(env, chatId, text, replyTo);
}

async function askAI(env, userId) {
  const systemPrompt = await getSetting(env, "system_prompt", DEFAULT_SYSTEM_PROMPT);
  const history = await getHistory(env, userId);

  return runAI(env, [
    { role: "system", content: systemPrompt },
    ...history
  ], 0.85, 1200);
}

async function runAI(env, messages, temperature, maxTokens) {
  if (!env.AI) throw new Error("Workers AI binding با نام AI پیدا نشد.");

  const result = await env.AI.run(AI_MODEL, {
    messages,
    max_tokens: maxTokens,
    temperature,
    top_p: 0.9,
    chat_template_kwargs: {
      enable_thinking: false
    }
  });

  console.log("AI RESPONSE:", JSON.stringify(result));

  const response =
    result?.response ??
    result?.choices?.[0]?.message?.content ??
    result?.result?.response ??
    result?.result?.choices?.[0]?.message?.content;

  if (typeof response !== "string" || !response.trim()) {
    throw new Error("Workers AI پاسخ متنی برنگرداند.");
  }

  return response.trim();
}


function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function normalize(text) {
  return String(text || "")
    .trim().toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ۀ/g, "ه")
    .replace(/ة/g, "ه")
    .replace(/\u200c/g, "")
    .replace(/\s+/g, " ");
}

function cleanText(text) {
  return String(text || "").replace(/\r\n/g, "\n").trim().slice(0, 3900);
}

function extractJSON(text) {
  if (!text) return null;

  const cleaned = String(text)
    .replace(/\`\`\`json/gi, "")
    .replace(/\`\`\`/g, "")
    .trim();

  try { return JSON.parse(cleaned); } catch {}

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try { return JSON.parse(cleaned.slice(start, end + 1)); }
  catch { return null; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
