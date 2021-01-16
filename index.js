const puppeteer = require("puppeteer");
const { spawn, exec } = require("child_process");
const fs = require("fs");
var rimraf = require("rimraf");

function awaitKeypress(msg) {
  return new Promise((resolve) => {
    console.log(msg);

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", () => {
      process.stdin.setRawMode(false);
      resolve();
    });
  });
}

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto("https://github.com/login");

  const clickButton = async (selector) => {
    let button = await page.$(selector);

    if (button) {
      await button.click();
    } else {
      console.error("Could not find button", selector);
      debugger;
      process.exit(1);
    }
  };

  const innerText = async (element) => {
    return await page.evaluate((el) => el.textContent, element);
  };

  const nextQuestion = async () => {
    await page.waitForTimeout(100);
    let b = await page.$x("//button[contains(., 'next question')]");

    if (b[0]) {
      b[0].click();
    } else {
      await page.reload();
    }
  };

  await awaitKeypress("Login with github. Press any key when you're ready");

  await page.goto("https://stripcode.dev");

  console.log("Playing game...");

  await clickButton("body > div > div > div > a");
  await page.waitForNavigation({});

  while (true) {
    await page.waitForTimeout(500);

    let choices = await page.$$(
      "div.\\32 xl\\:flex.\\32 xl\\:flex-row-reverse.\\32 xl\\:justify-center.bottom-wrapper > div.\\32 xl\\:ml-8.answer-half > div > button > span.text-bblack.font-medium"
    );

    let repos = await Promise.all(choices.map((c) => innerText(c)));

    console.log("Got new choices", repos);

    let filename = await innerText(
      await page.$(
        "div.\\32 xl\\:flex.\\32 xl\\:flex-row-reverse.\\32 xl\\:justify-center.bottom-wrapper > div.overflow-x-auto.code-half > h1"
      )
    );

    console.log("Challenge filename", filename);

    console.log("Cloning all challenge repos");
    await Promise.all(
      repos.map((repo) => {
        return new Promise((resolve) => {
          if (fs.existsSync(`/tmp/strip-decode/${repo}`)) {
            console.log("Already have ", repo);
            resolve();
          } else {
            console.log("Cloning repo ", repo);
            let git = spawn("git", [
              "clone",
              "--depth",
              "1",
              `https://github.com/${repo}.git`,
              `/tmp/strip-decode/${repo}`,
            ]);

            git.on("exit", () => resolve());
          }
        });
      })
    );

    console.log("Done");

    console.log("Pretesting...");

    let correctAnswer;

    let pretest = await Promise.all(
      repos.map(
        (repo) =>
          new Promise((resolve) => {
            let find = exec(`find . | grep "${filename}`, {
              cwd: `/tmp/strip-decode/${repo}`,
            });

            find.on("exit", (code) => resolve(code));
          })
      )
    );

    if (pretest.filter((x) => x == 0).length !== 1) {
      console.log("Pretest inconclusive");

      let challenge_code = await innerText(
        await page.$(
          "div.\\32 xl\\:flex.\\32 xl\\:flex-row-reverse.\\32 xl\\:justify-center.bottom-wrapper > div.overflow-x-auto.code-half > pre"
        )
      );

      fs.writeFileSync("/tmp/pattern", challenge_code);

      console.log("Got challenge code. Searching...");

      let testResults = await Promise.all(
        repos.map(
          (repo) =>
            new Promise((resolve) => {
              console.log("Searching", repo);
              let test = spawn("python3", [
                "test.py",
                "/tmp/pattern",
                `/tmp/strip-decode/${repo}`,
              ]);

              test.on("exit", (code) => resolve(code));
            })
        )
      );

      correctAnswer = testResults.indexOf(0);
    } else {
      console.log("Pretest conclusive");
      correctAnswer = pretest.indexOf(0);
    }

    if (correctAnswer >= 0) {
      console.log("Good answer", correctAnswer);
      await choices[correctAnswer].click();
    } else {
      console.log("I failed");
      await choices[Math.floor(Math.random() * 4)].click();
    }

    await nextQuestion();
  }
})();
