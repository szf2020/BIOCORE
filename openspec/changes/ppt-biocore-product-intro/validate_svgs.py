import xml.etree.ElementTree as ET
import re
import sys

base = "C:/biocore/openspec/changes/ppt-biocore-product-intro/slides"
slides = ["07", "08", "09"]

for i in slides:
    path = f"{base}/slide-{i}.svg"
    print(f"\n=== slide-{i}.svg ===")

    # 1. XML validity
    try:
        tree = ET.parse(path)
        root = tree.getroot()
        print("  [PASS] XML is valid")
    except ET.ParseError as e:
        print(f"  [FAIL] XML parse error: {e}")
        continue

    # 2. ViewBox check
    ns = "{http://www.w3.org/2000/svg}"
    vb = root.attrib.get("viewBox", "MISSING")
    if vb == "0 0 1280 720":
        print(f"  [PASS] viewBox={vb}")
    else:
        print(f"  [FAIL] viewBox={vb} (expected '0 0 1280 720')")

    # 3. Font size check
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    sizes = [int(s) for s in re.findall(r'font-size="(\d+)"', content)]
    if sizes:
        small = [s for s in sizes if s < 12]
        if small:
            print(f"  [WARN] font-size below 12px: {small}")
        else:
            print(f"  [PASS] font sizes OK (range {min(sizes)}-{max(sizes)})")

    # 4. Safe area check
    issues = []
    for elem in root.iter(f"{ns}text"):
        x = elem.attrib.get("x")
        y = elem.attrib.get("y")
        if x and y:
            try:
                xv, yv = float(x), float(y)
                txt = (elem.text or "")[:20]
                if xv < 60:
                    issues.append(f"x={xv}<60: '{txt}'")
                if xv > 1220:
                    issues.append(f"x={xv}>1220: '{txt}'")
                if yv < 40:
                    issues.append(f"y={yv}<40: '{txt}'")
                if yv > 680:
                    issues.append(f"y={yv}>680: '{txt}'")
            except ValueError:
                pass
    if issues:
        for iss in issues:
            print(f"  [WARN] safe area: {iss}")
    else:
        print("  [PASS] safe area OK")

    # 5. Color zone compliance (simplified)
    zone1 = {
        "#1E40AF", "#059669", "#F8FAFC", "#1E293B",
        "#64748B", "#94A3B8", "#CBD5E1", "#E2E8F0", "#F1F5F9",
        "#D97706", "#7C3AED", "#DC2626",
        "#FFFFFF", "#FAFBFD",
        "#FEF3C7", "#FEF2F2", "#ECFDF5",
        "#000000",
    }
    zone1_upper = {c.upper() for c in zone1}
    all_colors = set(re.findall(r'(?:fill|stroke|stop-color)="(#[0-9A-Fa-f]{3,8})"', content))
    defs_m = re.search(r"<defs>(.*?)</defs>", content, re.DOTALL)
    defs_colors = set()
    if defs_m:
        defs_colors = set(re.findall(r'(?:fill|stroke|stop-color)="(#[0-9A-Fa-f]{3,8})"', defs_m.group(1)))
    dec_colors = set()
    for dm in re.finditer(r'data-decorative="true"[^>]*>.*?</g>', content, re.DOTALL):
        dec_colors.update(re.findall(r'(?:fill|stroke|stop-color)="(#[0-9A-Fa-f]{3,8})"', dm.group(0)))
    core = all_colors - defs_colors - dec_colors
    unknown = {c for c in core if c.upper() not in zone1_upper}
    if unknown:
        print(f"  [NOTE] non-token colors in core UI: {unknown}")
    else:
        print("  [PASS] color zone compliance OK")

print("\nValidation complete.")
