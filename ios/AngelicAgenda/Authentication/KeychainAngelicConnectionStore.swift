import Foundation
import Security

protocol AngelicConnectionStoreProtocol: AnyObject {
    func load() throws -> AngelicConnection?
    func save(_ connection: AngelicConnection) throws
    func delete() throws
}

final class KeychainAngelicConnectionStore: AngelicConnectionStoreProtocol {
    private let service = "com.soujiroupersonalteam.AngelicAgenda.angelic-connection"
    private let account = "external-server"

    func load() throws -> AngelicConnection? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw AuthenticationError.connectionReadFailed
        }

        do {
            return try JSONDecoder().decode(AngelicConnection.self, from: data)
        } catch {
            throw AuthenticationError.connectionReadFailed
        }
    }

    func save(_ connection: AngelicConnection) throws {
        let data: Data
        do {
            data = try JSONEncoder().encode(connection)
        } catch {
            throw AuthenticationError.connectionSaveFailed
        }

        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let updateStatus = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw AuthenticationError.connectionSaveFailed
        }

        var insertQuery = baseQuery
        attributes.forEach { insertQuery[$0.key] = $0.value }
        guard SecItemAdd(insertQuery as CFDictionary, nil) == errSecSuccess else {
            throw AuthenticationError.connectionSaveFailed
        }
    }

    func delete() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw AuthenticationError.connectionDeleteFailed
        }
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}
