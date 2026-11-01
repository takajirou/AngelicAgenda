import SwiftUI

struct XConnectionView: View {
    @EnvironmentObject private var authentication: AuthenticationViewModel
    @State private var isShowingXLogin = false

    var body: some View {
        NavigationStack {
            ContentUnavailableView {
                Label("Xを接続", systemImage: "link")
            } description: {
                Text("この利用者専用の通知受信を開始します")
            } actions: {
                Button("Xにログインして接続") { isShowingXLogin = true }
                    .disabled(authentication.isWorking)
                Button("アプリからログアウト", role: .cancel) {
                    Task { await authentication.logout() }
                }
            }
            .navigationTitle("X接続")
        }
        .fullScreenCover(isPresented: $isShowingXLogin) {
            XWebLoginView { credentials in
                isShowingXLogin = false
                Task {
                    await XLoginWebView.clearXWebsiteData()
                    _ = await authentication.connectX(credentials: credentials)
                }
            }
        }
    }
}
