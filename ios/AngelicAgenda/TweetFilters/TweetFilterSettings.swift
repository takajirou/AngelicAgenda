import Foundation

enum TweetFilterCategory: String, Codable, CaseIterable, Identifiable, Sendable {
    case liveTicket = "live_ticket"
    case goods

    var id: String { rawValue }

    var title: String {
        switch self {
        case .liveTicket: "ライブチケット"
        case .goods: "グッズ告知"
        }
    }

    var explanation: String {
        switch self {
        case .liveTicket: "先行抽選、一般発売、公演の申込受付など"
        case .goods: "予約販売、受注生産、物販、再販など"
        }
    }
}

struct TweetFilterSettings: Codable, Equatable, Sendable {
    var filteringEnabled: Bool
    var categories: [TweetFilterCategory]
}
