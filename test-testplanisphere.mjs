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
