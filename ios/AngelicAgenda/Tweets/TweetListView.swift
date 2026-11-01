import SwiftUI

struct TweetListView: View {
    @EnvironmentObject private var authentication: AuthenticationViewModel
    @ObservedObject var viewModel: TweetListViewModel
    let session: AppSession
    @State private var pendingDestructiveAction: DestructiveAction?

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
                            Task { await load() }
                        }
                    }
                } else if viewModel.tweets.isEmpty {
                    ContentUnavailableView {
                        Label("告知はまだありません", systemImage: "bell.badge")
                    } description: {
                        Text("Xから受信したポストがここに表示されます")
                    } actions: {
                        Button("再読み込み") {
                            Task { await load() }
                        }
                    }
                } else {
                    List(viewModel.tweets) { tweet in
                        TweetContentRow(tweet: tweet)
                    }
                    .listStyle(.plain)
                    .refreshable {
                        await load()
                    }
                }
            }
            .navigationTitle("告知")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Text(session.user.email)
                        Button("X連携を解除", role: .destructive) {
                            pendingDestructiveAction = .disconnectX
                        }
                        Button("ログアウト") {
                            Task {
                                viewModel.reset()
                                await authentication.logout()
                            }
                        }
                        Button("アカウントを削除", role: .destructive) {
                            pendingDestructiveAction = .deleteAccount
                        }
                    } label: {
                        Image(systemName: "person.crop.circle")
                            .accessibilityLabel("アカウント")
                    }
                }
            }
            .task(id: session.token) {
                await load()
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
            .confirmationDialog(
                pendingDestructiveAction?.title ?? "",
                isPresented: Binding(
                    get: { pendingDestructiveAction != nil },
                    set: { if !$0 { pendingDestructiveAction = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button(pendingDestructiveAction?.buttonTitle ?? "実行", role: .destructive) {
                    let action = pendingDestructiveAction
                    pendingDestructiveAction = nil
                    Task {
                        viewModel.reset()
                        switch action {
                        case .disconnectX: await authentication.disconnectX()
                        case .deleteAccount: await authentication.deleteAccount()
                        case nil: break
                        }
                    }
                }
                Button("キャンセル", role: .cancel) { pendingDestructiveAction = nil }
            } message: {
                Text(pendingDestructiveAction?.message ?? "")
            }
        }
    }

    private func load() async {
        await viewModel.load(
            serverURL: AngelicServerConfiguration.baseURL,
            authToken: session.token
        )
        if viewModel.requiresAuthentication {
            authentication.invalidateSession()
        }
    }
}

private enum DestructiveAction {
    case disconnectX
    case deleteAccount

    var title: String {
        switch self {
        case .disconnectX: "X連携を解除しますか？"
        case .deleteAccount: "アカウントを削除しますか？"
        }
    }

    var buttonTitle: String {
        switch self {
        case .disconnectX: "X連携を解除"
        case .deleteAccount: "完全に削除"
        }
    }

    var message: String {
        switch self {
        case .disconnectX: "通知の受信を停止し、保存したX接続情報を削除します。"
        case .deleteAccount: "X連携、保存したポスト、ログイン情報を削除します。この操作は取り消せません。"
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
