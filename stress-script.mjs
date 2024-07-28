/**
 * 負荷テスト用スクリプト
 * ・ブラウザを指定数同時に開き、画面を操作するスクリプトを実行して、ページ読み込み時間を出力する
 * ・引数の代わりに環境変数(.env)で指定も可能
 * 引数
 *   1：実行するスクリプト(必須)
 * 　　 このスクリプトに記載された処理を実行する時間を計測する
 *   2：同時に開くブラウザ数
 *      未指定時は:PARALLEL_COUNT (両方未指定の場合:1)
 *   3: 1ブラウザあたりの繰り返し回数
 *      未指定時は環境変数：REPEAT_COUNT (両方未指定の場合:1)
 * ex. フォーム登録するスクリプト(test-testplanisphere.mjs)を3ブラウザ同時に2回実行する
 * $ node stress-script.mjs test-testplanisphere.mjs 3 2
 */
import { setTimeout } from 'timers/promises';
import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
dotenv.config(); // .env初期化

const getArgs = (i, def) => (process.argv.length > i ? process.argv[i] : def);
const formatHMS = (timestamp) => {
  return new Date(timestamp).toLocaleString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
};
const addLog = (i, times, duration, endTime) => {
  results.sequence.push({
    browser: i,
    times,
    duration,
    endTime: formatHMS(endTime),
  });
  results.durations[i - 1].push(duration);
};
// 引数1: 負荷テストスクリプト
const test_script = getArgs(2, '');
// 引数2: 並列実行数
const parallelCount = parseInt(getArgs(3, process.env.PARALLEL_COUNT ?? 1), 10);
// 引数3: 繰り返し回数
const repeatCount = getArgs(4, process.env.REPEAT_COUNT ?? 1);

// 対象URLがなければ終了
if (!test_script) {
  process.exit(0);
}

console.log(`param1 script  : ${test_script}`);
console.log(`param2 open    : ${parallelCount} browsers`);
console.log(`param3 repeat  : ${repeatCount} times`);

// chrome(headless: false)で起動
const browser = await chromium.launch({ headless: false });

// ブラウザを開く
// ・同一context内で複数ページを開くと、TCPコネクションを共有してしまうため、contextレベルで分離する
const contexts = [];
// 実行結果保持用
const results = { sequence: [], durations: [] };
for (let i = 0; i < parallelCount; i++) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(120 * 1000);
  contexts.push({ i: i + 1, context, page });
  results.durations.push([]);
}

// ストレステストファイル
const module = await import(`./${test_script}`);

// 全ブラウザの処理完了を管理する(Promise)ための配列
let procedures = [];

console.log(`====== start : ${formatHMS(Date.now())} ======`);
// ページ表示にかかった時間を、画面毎に表示する
for (let { i, page, context } of contexts) {
  procedures.push(
    new Promise(async (resolve) => {
      const procedure = async (times) => {
        if (times > repeatCount) {
          // 指定回数実行したら終了
          resolve();
          return context.close();
        }

        // 初回のみ、各ブラウザアクセスが集中しないように10ms程度ずらす
        if (times === 1) {
          await setTimeout(Math.floor(Math.random() * 20));
        }

        // 開始時間
        const startTime = Date.now();

        // ページを操作するスクリプトを実行する
        await module.operate_page(page, i, times);

        // 画面表示完了にかかった時間を表示
        const endTime = Date.now();
        const duration = endTime - startTime;
        console.log(`#${i}-${times} time: ${duration}ms`);
        addLog(i, times, duration, endTime);

        // 再度実行するため、画面をクリア
        await page.goto('about:blank');

        // 指定回数になるまで再帰
        procedure(++times);
      };
      procedure(1);
    })
  );
}

const dumpResult = (results) => {
  const durations = results.sequence.map((x) => x.duration);
  let mean = (durations.reduce((x, y) => x + y) / durations.length).toFixed(2);
  let min = Math.min(...durations);
  let max = Math.max(...durations);

  console.log(`mean:${mean}(ms) min: ${min}(ms) max:${max}(ms)`);
  console.log(results);
};

// 全処理が完了したら後始末
Promise.all(procedures).then(() => {
  console.log(`====== end:${formatHMS(Date.now())} ======`);
  console.log('\n******** result ********');
  dumpResult(results);
  return browser.close();
});
