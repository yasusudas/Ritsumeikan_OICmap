// Read-only CoreGraphics inventory for scripted native window capture.
import Foundation
import CoreGraphics
let owner = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "Safari"
let title = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "Dev vs Version3.1"
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let matches = windows.filter { ($0[kCGWindowOwnerName as String] as? String) == owner && ($0[kCGWindowName as String] as? String)?.contains(title) == true }
let data = try JSONSerialization.data(withJSONObject: matches, options: [.prettyPrinted, .sortedKeys])
print(String(data:data, encoding:.utf8)!)
