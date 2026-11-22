// 英語の使い方 6 枚の title・description・og:title（yorozu-plans ROADMAP 7.260 の追補の 6、D753。Q-991）
// 字は Fable が英文の関門を通した表のまま。title の本体は 60 字以内・description は 110〜160 字（D472）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

const PAGES = {
  'childcare-leave': ['Japan Childcare Leave Benefit: How It Is Calculated, FAQ', 'How childcare leave benefit in Japan is calculated: 67% then 50% of your daily wage, the monthly cap, the 13% post-birth top-up, and when it is paid.'],
  'pension-refund': ['Japan Pension Refund: How It Is Calculated, Tax Refund, FAQ', 'How the Japan pension refund (Lump-sum Withdrawal Payment) is calculated, how to get the 20.42% tax back, what happens after 5 years, and the claim deadline.'],
  'residence-tax': ['Japan Residence Tax: How It Is Calculated, When It Starts', 'How residence tax in Japan is calculated: the 10% income levy, the per capita levy, the tax-free limit, why it starts a year later, and leaving Japan.'],
  'take-home-pay': ['Japan Take-Home Pay: How Tax and Insurance Are Deducted', 'How take-home pay is calculated in Japan: social insurance, income tax with the 2026 rules, why residence tax starts a year later, and non-residents.'],
  'high-cost-medical': ['Japan High-Cost Medical Expense Benefit: Monthly Limits, FAQ', 'How the high-cost medical expense benefit in Japan works: the monthly limits from August 2026, age 70 and over, the yearly cap, and how to claim.'],
  'moving-checklist': ['Moving in Japan as a Foreign Resident: What Each Step Means', 'What each step in the Japan moving checklist means: the 14-day address notice, visa renewal from 3 months before, the My Number card, and leaving Japan.'],
};

for (const [slug, [title, desc]] of Object.entries(PAGES)) {
  test(`${slug}/guide.html: title・description・og:title が表の字`, () => {
    const h = fs.readFileSync(path.join(root, 'en', slug, 'guide.html'), 'utf8');
    assert.equal(h.match(/<title>([^<]*)<\/title>/)[1], title + ' | yorozu-craft');
    assert.equal(h.match(/<meta name="description" content="([^"]*)">/)[1], desc);
    assert.equal(h.match(/<meta property="og:title" content="([^"]*)">/)[1], title);
    assert.ok([...title].length <= 60, 'title 本体 60 字以内');
    assert.ok(desc.length >= 110 && desc.length <= 160, 'description 110〜160 字');
  });
}
