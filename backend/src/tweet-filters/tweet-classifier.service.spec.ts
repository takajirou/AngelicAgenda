import { TweetClassifierService } from './tweet-classifier.service.js';

describe('TweetClassifierService', () => {
  const classifier = new TweetClassifierService();

  it.each([
    ['ライブチケットの先行抽選受付を開始します', ['live_ticket']],
    ['東京公演の一般発売は明日10時からです', ['live_ticket']],
    ['NEW GOODSの予約販売を開始しました', ['goods']],
    ['会場物販のラインナップを公開します', ['goods']],
    ['ライブ会場限定グッズの先行販売を開始します', ['live_ticket', 'goods']],
  ])('classifies announcement text: %s', (text, expected) => {
    expect(classifier.classify(text)).toEqual(expected);
  });

  it.each([
    '昨日のライブは楽しかったです',
    '新しい衣装を公開しました',
    'おはようございます',
    'チケットを持って会場へ向かいます',
  ])('does not classify ordinary posts: %s', (text) => {
    expect(classifier.classify(text)).toEqual([]);
  });

  it('normalizes full-width latin text before classification', () => {
    expect(classifier.classify('ＬＩＶＥ ＴＩＣＫＥＴ 先行受付')).toEqual([
      'live_ticket',
    ]);
  });
});
