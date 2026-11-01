import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var authentication: AuthenticationViewModel
    @StateObject private var tweetList = TweetListViewModel()

    var body: some View {
        Group {
            if let connection = authentication.connection {
                authenticatedView(connection: connection)
            } else {
                LoginView()
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

    private func authenticatedView(connection: AngelicConnection) -> some View {
        TweetListView(
            viewModel: tweetList,
            connection: connection,
            onSignOut: authentication.signOut
        )
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
            .environmentObject(AuthenticationViewModel.preview(connected: true))
    }
}
