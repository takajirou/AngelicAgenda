import Foundation

struct TweetContent: Decodable, Equatable, Identifiable, Sendable {
    let tweetId: String
    let text: String
    let authorDisplayName: String
    let authorHandle: String?
    let originalUrl: URL
    let notificationType: String?
    let sourceTag: String?
    let notifiedAt: Date?
    let receivedAt: Date

    var id: String { tweetId }
}
