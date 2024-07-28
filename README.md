# 複数ブラウザを同時に起動して、フォーム登録を行い負荷テストを行う方法(PlayWright)

## はじめに
[PlayWright](https://playwright.dev/)を利用して、フォーム入力＋POSTを複数ブラウザから同時に実行した際のレスポンス時間を計測するスクリプトです

複数ブラウザ起動＋指定回数のフォーム登録部分(共通部分)を`stress-script.mjs`で実装

別途フォーム登録スクリプトを用意し、共通部で`dynamic import`して呼び出す仕組みです

### ex. フォーム登録するスクリプト(test-testplanisphere.mjs)を、 3ブラウザ同時 × 2回繰り返しアクセス（合計6回）した場合

  * 引数でスクリプト、同時にブラウザを起動する数、リピート回数を指定します
  * 初回に3.1秒、2回目に1.2秒程度かかかったことがわかります
```
$ node stress-script.mjs test-testplanisphere.mjs 3 2
param1 script  : test-testplanisphere.mjs
param2 open    : 3 browsers
param3 repeat  : 2 times
====== start : 22:52:25.589 ======
#1-1 time: 3156ms
#3-1 time: 3165ms
#2-1 time: 3189ms
#1-2 time: 1232ms
#3-2 time: 1239ms
#2-2 time: 1370ms
====== end:22:52:30.227 ======

******** result ********
mean:2225.17(ms) min: 1232(ms) max:3189(ms)
{
  sequence: [
    { browser: 1, times: 1, duration: 3156, endTime: '22:52:28.772' },
    { browser: 3, times: 1, duration: 3165, endTime: '22:52:28.781' },
    { browser: 2, times: 1, duration: 3189, endTime: '22:52:28.804' },
    { browser: 1, times: 2, duration: 1232, endTime: '22:52:30.064' },
    { browser: 3, times: 2, duration: 1239, endTime: '22:52:30.073' },
    { browser: 2, times: 2, duration: 1370, endTime: '22:52:30.211' }
  ],
  durations: [ [ 3156, 1232 ], [ 3189, 1370 ], [ 3165, 1239 ] ]
}
```

https://github.com/murasuke/js-stress-script

以前作成した[複数ブラウザを同時に起動して負荷テストを行うためのスクリプト](https://qiita.com/murasuke/items/eac60c8dee23718ef3f0)は、ページのロード時間しか計測できませんでした（指定したURLを開く時間を計測）

そこで今回は、ブラウザを操作する処理(フォーム登録など)を別ファイルに切り出して、そのファイルを動的に読み込む(起動時の引数でファイルを指定)ことにしました

* ブラウザを利用して負荷をかけるため、cssやjavascriptファイルも同時に取得します
* 指定した数のブラウザを同時に開き、指定した回数分`ブラウザを操作するスクリプト`を実行します

## 概要説明

### ブラウザを操作するスクリプト

`operate_page(page, i, times){}`関数を定義して、ブラウザ(page)を操作する処理を記載します

* 例：特定のURLを開く時間を計測する
```javascript:test-testplanisphere.mjs
/**
 * テスト自動化学習用サイト(hotel.testplanisphere.dev)で予約入力を行うスクリプト
 * ・https://qiita.com/yaboxi_/items/b9343019b51543a5f6f6 のソースを利用
 * @param {Page} page
 * @param {intger} i 複数起動したブラウザの連番(1～)
 * @param {intger} times 実行回数(?回目)
 */
export async function operate_page(page, i, times) {
  await page.goto('https://hotel.testplanisphere.dev/');
}
```

このファイルに「`ページを開き、フォームに入力して、登録ボタンをクリックする`」等、処理時間を計測するための処理を記載します

### ブラウザを複数同時に開く処理について

同一[context](https://playwright.dev/docs/api/class-browsercontext)内で複数[ページ](https://playwright.dev/docs/api/class-page)を開く(タブを追加する)と、TCPコネクションを共有してしまうため、contextレベル(別ウィンドウを開く)で分離します

* `browser.newContext()`でブラウザウィンドウを開き、`context.newPage()`タブを生成するイメージです

```javascript
const contexts = [];
for (let i = 0; i < parallelCount; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    contexts.push({i: i+1, context, page});
}
```

### 複数のウィンドウを同時に操作する処理について

* dynamic load`await import()`で外部ファイルを動的にロードします
* ページ読み込みが終わったら、処理を指定回数繰り返すため、再帰呼び出しを利用します(procedure()関数)

詳細は下記のコメント参照
* 一部本筋と関係ない処理(ログ等)は削除

```javascript
// ストレステストファイル
const module = await import(`./${test_script}`);

// 全ブラウザの処理完了を管理する(Promise)ための配列
let procedures = [];

console.log(`====== start : ${formatHMS(Date.now())} ======`);

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

        // ページを操作するスクリプトを実行する
        await module.operate_page(page, i, times);

        // 再度実行するため、画面をクリア
        await page.goto('about:blank');

        // 指定回数になるまで再帰
        procedure(++times);
      };
      procedure(1);
    })
  );
}

// 全処理が完了したらブラウザを閉じる
Promise.all(procedures).then(() => {
    return browser.close();
}
```

### 引数仕様

1. 実行するスクリプト(必須)

   このスクリプトに記載された処理を実行する時間を計測する

2. 同時に開くブラウザ数

    未指定時は:PARALLEL_COUNT (両方未指定の場合:1)

3. 1ブラウザあたりの繰り返し回数

    未指定時は環境変数：REPEAT_COUNT (両方未指定の場合:1)


## ソース(共通部分から呼び出す、フォーム登録処理のサンプル)

テスト自動化学習用サイト(hotel.testplanisphere.dev)で予約入力を行うスクリプト
[VSCodeでPlaywrightによるE2Eテスト自動化をはじめてみよう](https://qiita.com/yaboxi_/items/b9343019b51543a5f6f6) のソースを参考に一部変更しました

```javascript:test-testplanisphere.mjs
/**
 * テスト自動化学習用サイト(hotel.testplanisphere.dev)で予約入力を行うスクリプト
 * ・https://qiita.com/yaboxi_/items/b9343019b51543a5f6f6 のソースを利用
 * @param {Page} page
 * @param {intger} i 複数起動したブラウザの連番(1～)
 * @param {intger} times 実行回数(?回目)
 */
export async function operate_page(page, i, times) {
  await page.goto('https://hotel.testplanisphere.dev/');

  // 日本語トップをクリック
  await page.getByRole('link', { name: 'トップページへ' }).click();

  // 宿泊予約ページをクリック
  await page.getByRole('link', { name: '宿泊予約' }).click();

  // 「お得な特典付きプラン」をクリック
  const [page1] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('.card-body > .btn').first().click(),
  ]);

  // 予約フォーム入力
  // 宿泊日を当月の30日
  await page1.getByLabel('宿泊日 必須').click();
  // await page1.getByRole('link', { name: '30' }).click();
  await page1.getByRole('link').last().click();

  // 宿泊数を入力
  await page1.getByLabel('宿泊数 必須').fill('1');

  // 人数を入力
  await page1.getByLabel('人数 必須').fill('1');

  // オプションを設定
  await page1.getByLabel('朝食バイキング').check();

  // 氏名を入力
  await page1.getByLabel('氏名 必須').fill('サンタ');

  // 確認の連絡の入力
  await page1
    .getByRole('combobox', { name: '確認のご連絡 必須' })
    .selectOption('no');

  // 予約内容を確認ボタンをクリック
  await page1.locator('[data-test="submit-button"]').click();

  // タグを閉じる
  await page1.close();
}

```

## ソース(複数ブラウザ起動＋指定回数実行＋結果表示部分(共通部分))
```javascript:stress-script.mjs
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

```
