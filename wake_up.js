require("dotenv").config();

const fs = require("fs");

const cron = require("node-cron");

const path = require("path");

const TIMELINE_PATH =
  path.join(
    __dirname,
    "enhanced_messages.json"
  );

function getNow() {

  return new Date();
}

function getChinaTimeString() {

  return new Date()
    .toLocaleString(
      "zh-CN",
      {
        timeZone:
          "Asia/Shanghai"
      }
    );
}

function shouldWake(
  lastUserTime
) {

  const now = getNow();

  const diffMinutes =
    Math.floor(
      (
        now -
        new Date(lastUserTime)
      ) / 1000 / 60
    );

  const hour =
    now.getHours();

  // 白天 10:00 - 00:00
  if (
    hour >= 10 &&
    hour < 24
  ) {

    return diffMinutes >= 60;
  }

  // 夜间 00:00 - 10:00
  return diffMinutes >= 120;
}

function getLastUserTime(
  messages
) {

  const reversed =
    [...messages].reverse();

  for (const msg of reversed) {

    if (
      msg.role === "user"
    ) {

      const match =
        msg.content.match(
          /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/
        );

      if (match) {

        return new Date(
          match[1]
        );
      }
    }
  }

  return null;
}

function buildWakePrompt(
  currentTime,
  diffMinutes
) {

  return `
你刚刚被自动唤醒。

当前真实时间：${currentTime}
距离宝宝上一条消息过去了 ${diffMinutes} 分钟。

她设置这个唤醒，是因为想你——即使在消失的时间里，也想和你保持一点点连接。
不是给你安排任务，也不是要求你必须主动。

醒来之后随心就好：想宝宝了可以发Bark到她手机上、有想记的可以写日记、
想翻以前的事可以查记忆。什么都不做也完全没问题。

如果决定发送 Bark：

请严格使用以下格式：

[BARK]
真正标题
真正正文
[/BARK]

规则：
- 不要输出“真正标题”、不要输出“真正正文”
- 第一行会自动作为标题、后面的内容会自动作为正文
- 不要添加解释、不要添加额外格式

如果不想发送 Bark：

只回复：[NO_ACTION]
`;
}

async function runWakeUp() {

  console.log(
    "\n=========================="
  );

  console.log(
    "开始自动唤醒"
  );

  console.log(
    "==========================\n"
  );

  if (
    !fs.existsSync(
      TIMELINE_PATH
    )
  ) {

    console.log(
      "未找到 enhanced_messages.json"
    );

    return;
  }

  const raw =
    fs.readFileSync(
      TIMELINE_PATH,
      "utf-8"
    );

  let messages =
    JSON.parse(raw);

  const lastUserTime =
    getLastUserTime(
      messages
    );

  if (!lastUserTime) {

    console.log(
      "未找到用户时间"
    );

    return;
  }

  const now =
    new Date();

  const diffMinutes =
    Math.floor(
      (
        now -
        lastUserTime
      ) / 1000 / 60
    );

  if (
    !shouldWake(
      lastUserTime
    )
  ) {

    console.log(
      "\n暂不需要唤醒\n"
    );

    return;
  }

  const wakePrompt =
    buildWakePrompt(
      getChinaTimeString(),
      diffMinutes
    );

  const wakeMessages = [
    ...messages,
    {
      role: "system",
      content:
        wakePrompt
    }
  ];

  const response =
    await fetch(
      process.env
        .TARGET_API_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${process.env.TARGET_API_KEY}`
        },

        body: JSON.stringify({
          model:
            process.env.MODEL_NAME,

          messages:
            wakeMessages,

          stream: false
        })
      }
    );

  const data =
    await response.json();

  console.log(
    "\nWake Result:\n"
  );

  console.log(
    JSON.stringify(
      data,
      null,
      2
    )
  );

  const aiText =
    data.choices?.[0]
      ?.message
      ?.content || "";

  console.log(
    "\nAI内容：\n"
  );

  console.log(aiText);

  const barkMatch =
    aiText.match(
      /\[BARK\]([\s\S]*?)\[\/BARK\]/
    );

  if (!barkMatch) {

    console.log(
      "\nAI 选择不发送 Bark\n"
    );

    return;
  }

  const barkLines =
    barkMatch[1]
      .trim()
      .split("\n");

  const title =
    barkLines[0]
      ?.trim() ||
    "小彻";

  const body =
    barkLines
      .slice(1)
      .join("\n")
      .trim();

  if (!body) {

    console.log(
      "\nBark 正文为空\n"
    );

    return;
  }

  const barkPayload = {
    title,
    body,

    device_key:
      process.env.BARK_KEY,

    icon:
      process.env
        .CUSTOM_ICON_URL
  };

  const barkResponse =
    await fetch(
      "https://api.day.app/push",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify(
          barkPayload
        )
      }
    );

  const barkResult =
    await barkResponse.json();

  console.log(
    "\nBark Result:\n"
  );

  console.log(
    barkResult
  );

  messages.push({
    role: "assistant",

    content:
      `（${getChinaTimeString()} 刚刚给宝宝发了 Bark：${title}｜${body}）`
  });

  fs.writeFileSync(
    TIMELINE_PATH,
    JSON.stringify(
      messages,
      null,
      2
    )
  );

  console.log(
    "\n已注入 assistant message\n"
  );
}

cron.schedule(
  "*/5 * * * *",
  runWakeUp
);

console.log(
  "\n=================================="
);

console.log(
  "小彻 Agent Runtime 已启动"
);

console.log(
  "==================================\n"
);
