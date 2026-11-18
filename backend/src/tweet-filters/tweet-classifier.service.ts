import { Injectable } from '@nestjs/common';
import type { TweetFilterCategory } from './tweet-filter.model.js';

interface CategoryRule {
  category: TweetFilterCategory;
  subjectTerms: readonly string[];
  actionTerms: readonly string[];
}

const categoryRules: readonly CategoryRule[] = [
  {
    category: 'live_ticket',
    subjectTerms: [
      'ライブ',
      'live',
      '公演',
      'コンサート',
      'concert',
      'ツアー',
      'チケット',
      'ticket',
      'プレイガイド',
    ],
    actionTerms: [
      '先行',
      '抽選',
      '受付',
      '申込',
      '申し込み',
      '一般発売',
      '販売開始',
      '発売開始',
    ],
  },
  {
    category: 'goods',
    subjectTerms: [
      'グッズ',
      'goods',
      '物販',
      '商品',
      'アイテム',
      'merch',
      '受注生産',
    ],
    actionTerms: [
      '販売',
      '発売',
      '予約',
      '受注',
      '通販',
      'オンラインストア',
      '再販',
      '購入',
      'ラインナップ',
    ],
  },
];

@Injectable()
export class TweetClassifierService {
  classify(text: string): TweetFilterCategory[] {
    const normalized = text.normalize('NFKC').toLocaleLowerCase('ja-JP');

    return categoryRules
      .filter(
        (rule) =>
          this.containsAny(normalized, rule.subjectTerms) &&
          this.containsAny(normalized, rule.actionTerms),
      )
      .map((rule) => rule.category);
  }

  private containsAny(text: string, terms: readonly string[]): boolean {
    return terms.some((term) => text.includes(term));
  }
}
