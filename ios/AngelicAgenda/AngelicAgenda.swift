import SwiftUI

@main
struct AngelicAgendaApp: App {
    @StateObject private var authentication = AuthenticationViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authentication)
        }
    }
}
