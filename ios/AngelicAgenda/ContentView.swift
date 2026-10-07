import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "告知はまだありません",
                systemImage: "bell.badge",
                description: Text("受信した告知がここに表示されます")
            )
            .navigationTitle("告知")
        }
    }
}

#Preview {
    ContentView()
}
