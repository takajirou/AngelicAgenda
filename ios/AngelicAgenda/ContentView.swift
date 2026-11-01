import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var authentication: AuthenticationViewModel
    @StateObject private var tweetList = TweetListViewModel()

    var body: some View {
        Group {
            if let session = authentication.session {
                authenticatedView(session: session)
            } else {
                LoginView()
            }
        }
        .task(id: authentication.session?.token) {
            if authentication.session != nil {
                await authentication.refreshXConnection()
            }
        }
        .alert(
            "接続できませんでした",
            isPresented: Binding(
                get: { authentication.errorMessage != nil },
                set: { if !$0 { authentication.clearError() } }
            )
        ) {
            Button("閉じる", role: .cancel) {
                authentication.clearError()
            }
        } message: {
            Text(authentication.errorMessage ?? "時間をおいて、もう一度お試しください。")
        }
    }

    @ViewBuilder
    private func authenticatedView(session: AppSession) -> some View {
        if authentication.isXConnected == true {
            TweetListView(viewModel: tweetList, session: session)
        } else if authentication.isXConnected == false {
            XConnectionView()
        } else {
            ProgressView("接続状態を確認しています")
        }
    }
}
