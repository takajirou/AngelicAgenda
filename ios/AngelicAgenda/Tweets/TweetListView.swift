import SwiftUI

struct TweetListView: View {
    @ObservedObject var viewModel: TweetListViewModel
    let connection: AngelicConnection
    let onSignOut: () -> Void

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.tweets.isEmpty {
                    ProgressView("告知を読み込んでいます")
                } else if let errorMessage = viewModel.errorMessage, viewModel.tweets.isEmpty {
                    ContentUnavailableView {
                        Label("告知を取得できません", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(errorMessage)
                    } actions: {
                        Button("再試行") {
                            Task { await viewModel.load(serverURL: connection.serverURL) }
                        }
                    }
                } else if viewModel.tweets.isEmpty {
                    ContentUnavailableView {
                        Label("告知はまだありません", systemImage: "bell.badge")
                    } description: {
                        Text("Xから受信したポストがここに表示されます")
                    } actions: {
                        Button("再読み込み") {
                            Task { await viewModel.load(serverURL: connection.serverURL) }
                        }
                    }
                } else {
                    List(viewModel.tweets) { tweet in
                        TweetContentRow(tweet: tweet)
                    }
                    .listStyle(.plain)
                    .refreshable {
                        await viewModel.load(serverURL: connection.serverURL)
                    }
                }
            }
            .navigationTitle("告知")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Text(connection.serverURL.host() ?? connection.serverURL.absoluteString)
                        Button("この端末の接続情報を削除", role: .destructive) {
                            viewModel.reset()
                            onSignOut()
                        }
                    } label: {
                        Image(systemName: "person.crop.circle")
                            .accessibilityLabel("アカウント")
                    }
                }
            }
            .task(id: connection.connectedAt) {
                await viewModel.load(serverURL: connection.serverURL)
            }
            .alert(
                "更新できませんでした",
                isPresented: Binding(
                    get: { !viewModel.tweets.isEmpty && viewModel.errorMessage != nil },
                    set: { if !$0 { viewModel.clearError() } }
                )
            ) {
                Button("閉じる", role: .cancel) { viewModel.clearError() }
            } message: {
                Text(viewModel.errorMessage ?? "時間をおいて、もう一度お試しください。")
            }
        }
    }
}

private struct TweetContentRow: View {
    let tweet: TweetContent

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(tweet.authorDisplayName)
                    .font(.headline)
                if let authorHandle = tweet.authorHandle {
                    Text("@\(authorHandle)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            Text(tweet.text)
                .font(.body)
                .textSelection(.enabled)

            HStack {
                Text(tweet.receivedAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Link("元のポストを開く", destination: tweet.originalUrl)
                    .font(.caption.weight(.semibold))
            }
        }
        .padding(.vertical, 6)
    }
}
