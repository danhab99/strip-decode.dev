const puppeteer = require("puppeteer");
const { spawn, exec } = require("child_process");
const fs = require("fs");
var rimraf = require("rimraf");
const chalk = require("chalk");
const path = require("path");

const WORKDIR = (p) => path.join("/tmp/strip-decode", p);

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
  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: WORKDIR(".chrome"),
  });
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

  console.log(chalk.greenBright.bold("Playing game..."));

  await clickButton("body > div > div > div > a");
  await page.waitForNavigation({});

  while (true) {
    await page.waitForTimeout(500);

    let choices = await page.$$(
      "div.\\32 xl\\:flex.\\32 xl\\:flex-row-reverse.\\32 xl\\:justify-center.bottom-wrapper > div.\\32 xl\\:ml-8.answer-half > div > button > span.text-bblack.font-medium"
    );

    let repos = await Promise.all(choices.map((c) => innerText(c)));

    console.log(chalk.cyanBright("Got new choices"), repos);

    let filename = await innerText(
      await page.$(
        "div.\\32 xl\\:flex.\\32 xl\\:flex-row-reverse.\\32 xl\\:justify-center.bottom-wrapper > div.overflow-x-auto.code-half > h1"
      )
    );

    console.log(chalk.cyanBright("Challenge filename"), filename);

    console.log(chalk.yellowBright.underline("Cloning all challenge repos"));
    await Promise.all(
      repos.map((repo) => {
        return new Promise((resolve) => {
          if (fs.existsSync(WORKDIR(repo))) {
            console.log(chalk.blueBright("Already have"), repo);
            resolve();
          } else {
            console.log(chalk.blue("Cloning repo"), repo);
            let git = spawn("git", [
              "clone",
              "--depth",
              "1",
              `https://github.com/${repo}.git`,
              WORKDIR(repo),
            ]);

            git.on("exit", () => resolve());
          }
        });
      })
    );

    console.log(chalk.greenBright.underline("Done!"));

    console.log(chalk.magentaBright("Pretesting..."));

    let correctAnswer;

    let pretest = await Promise.all(
      repos.map(
        (repo) =>
          new Promise((resolve) => {
            let find = exec(`find . | grep "${filename}`, {
              cwd: WORKDIR(repo),
            });

            find.on("exit", (code) => resolve(code));
          })
      )
    );

    if (pretest.filter((x) => x == 0).length !== 1) {
      console.log(chalk.red("Pretest inconclusive"));

      let challenge_code = await innerText(
        await page.$(
          "div.\\32 xl\\:flex.\\32 xl\\:flex-row-reverse.\\32 xl\\:justify-center.bottom-wrapper > div.overflow-x-auto.code-half > pre"
        )
      );

      fs.writeFileSync(WORKDIR("pattern"), challenge_code);

      console.log(chalk.yellowBright("Got challenge code. Searching..."));

      let testResults = await Promise.all(
        repos.map(
          (repo) =>
            new Promise((resolve) => {
              console.log(chalk.yellow("Searching"), repo);
              let test = spawn("python3", [
                "test.py",
                WORKDIR("pattern"),
                WORKDIR(repo),
              ]);

              test.on("exit", (code) => resolve(code));
            })
        )
      );

      correctAnswer = testResults.indexOf(0);
    } else {
      console.log(chalk.greenBright("Pretest conclusive"));
      correctAnswer = pretest.indexOf(0);
    }

    if (correctAnswer >= 0) {
      console.log(chalk.greenBright.bold("!!!Good answer!!!"), correctAnswer);
      await choices[correctAnswer].click();
    } else {
      console.log(chalk.gray("I failed"));
      await choices[Math.floor(Math.random() * 4)].click();
    }

    await nextQuestion();
  }
})();
