import AppKit
import CoreGraphics
import Foundation

let data: [String: Any] = [
    "screens": NSScreen.screens.map {
        [
            "frame": NSStringFromRect($0.frame),
            "maxFPS": $0.maximumFramesPerSecond,
            "scale": $0.backingScaleFactor,
        ]
    },
    "lowPower": ProcessInfo.processInfo.isLowPowerModeEnabled,
    "thermalState": ProcessInfo.processInfo.thermalState.rawValue,
    "frontApp": NSWorkspace.shared.frontmostApplication?.localizedName ?? "",
]
let bytes = try JSONSerialization.data(withJSONObject: data, options: [.prettyPrinted, .sortedKeys])
print(String(data: bytes, encoding: .utf8)!)
