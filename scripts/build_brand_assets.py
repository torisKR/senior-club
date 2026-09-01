#!/usr/bin/env python3
"""Build deterministic 시니어클럽 runtime and Google Play brand assets.

The input mark is the alpha-cleaned imagegen output. This script deliberately
flattens its colors and applies platform-specific safe areas so generated pixels
do not leak directly into Android adaptive icons or splash assets.
"""

from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE_MARK = ROOT / "assets/imagegen-source/senior-club-logo-v2-flat.png"
SOURCE_HERO = ROOT / "public/images/club-senior-hero.jpg"
SOURCE_GARDEN = ROOT / "public/images/event-gardening.jpg"
SOURCE_CLASSICAL = ROOT / "public/images/event-classical.jpg"

MOBILE_IMAGES = ROOT / "apps/mobile/assets/images"
STORE_LISTING = ROOT / "apps/mobile/store-listing"
WEB_IMAGES = ROOT / "public/images"

PINE = (14, 81, 66)
CORAL = (242, 138, 84)
SKY = (84, 172, 201)
# The generated mark's fourth person was originally cream-on-cream (1.02:1),
# which disappeared at launcher and favicon sizes. Warm ochre keeps the visual
# role while preserving a clearly readable four-person loop.
CREAM_ACCENT = (183, 121, 31)
SURFACE = (247, 244, 236)


def flatten_generated_mark(path: Path) -> Image.Image:
    source = Image.open(path).convert("RGBA")
    flattened: list[tuple[int, int, int, int]] = []

    for red, green, blue, alpha in source.get_flattened_data():
        if alpha <= 2:
            flattened.append((0, 0, 0, 0))
            continue

        hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        if saturation < 0.24 and value > 0.62:
            color = CREAM_ACCENT
        elif hue < 0.12 or hue > 0.95:
            color = CORAL
        elif 0.44 <= hue <= 0.62:
            color = SKY
        else:
            color = PINE
        flattened.append((*color, alpha))

    result = Image.new("RGBA", source.size)
    result.putdata(flattened)
    alpha_box = result.getchannel("A").getbbox()
    if alpha_box is None:
        raise ValueError("The generated logo has no visible pixels")
    return result.crop(alpha_box)


def place_mark(mark: Image.Image, size: int, mark_width: int, background: tuple[int, int, int, int]) -> Image.Image:
    ratio = mark_width / mark.width
    resized = mark.resize((mark_width, round(mark.height * ratio)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), background)
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def place_mark_max_dimension(
    mark: Image.Image,
    size: int,
    max_dimension: int,
    background: tuple[int, int, int, int],
) -> Image.Image:
    """Center a mark while constraining both width and height."""
    ratio = max_dimension / max(mark.width, mark.height)
    resized = mark.resize(
        (round(mark.width * ratio), round(mark.height * ratio)),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (size, size), background)
    canvas.alpha_composite(
        resized,
        ((size - resized.width) // 2, (size - resized.height) // 2),
    )
    return canvas


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)")


def save_optimized_jpeg(source_path: Path, output_path: Path, max_width: int = 1280) -> None:
    image = Image.open(source_path).convert("RGB")
    if image.width > max_width:
        height = round(image.height * (max_width / image.width))
        image = image.resize((max_width, height), Image.Resampling.LANCZOS)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, format="JPEG", quality=80, optimize=True, progressive=True)
    print(f"wrote {output_path.relative_to(ROOT)} ({output_path.stat().st_size:,} bytes)")


def korean_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = (
        Path("/System/Library/Fonts/AppleSDGothicNeo.ttc"),
        Path("/System/Library/Fonts/Supplemental/AppleGothic.ttf"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    raise FileNotFoundError("A Korean font is required to build the Play feature graphic")


def build_feature_graphic(mark: Image.Image) -> Image.Image:
    canvas = Image.new("RGB", (1024, 500), SURFACE)
    photo = ImageOps.fit(Image.open(SOURCE_HERO).convert("RGB"), (600, 500), Image.Resampling.LANCZOS)
    mask = Image.new("L", photo.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse((0, -170, 900, 670), fill=255)
    canvas.paste(photo, (424, 0), mask)

    compact_mark = place_mark(mark, 100, 84, (0, 0, 0, 0))
    canvas.paste(compact_mark, (82, 44), compact_mark)

    draw = ImageDraw.Draw(canvas)
    draw.text((188, 66), "시니어클럽", font=korean_font(38), fill=PINE)
    draw.multiline_text(
        (82, 188),
        "좋아하는 일을 함께,\n다음 약속까지",
        font=korean_font(42),
        fill=PINE,
        spacing=12,
    )
    draw.text((82, 337), "관심사로 만나 활동하고 관계를 이어가요", font=korean_font(21), fill=(67, 79, 76))
    draw.rounded_rectangle((82, 392, 356, 444), radius=26, fill=(229, 239, 234))
    draw.text((106, 405), "목적  ·  사람  ·  활동  ·  관계", font=korean_font(18), fill=PINE)
    return canvas


def build_tab_icons() -> None:
    font_candidates = tuple(
        (ROOT / "apps/mobile/node_modules/.pnpm").glob(
            "@expo-google-fonts+material-symbols@*/node_modules/@expo-google-fonts/"
            "material-symbols/600SemiBold/MaterialSymbols_600SemiBold.ttf"
        )
    )
    if not font_candidates:
        raise FileNotFoundError("Install mobile dependencies before building tab icons")

    font = ImageFont.truetype(str(font_candidates[0]), size=64)
    codepoints = {
        "home": 0xE88A,
        "clubs": 0xF233,
        "events": 0xE878,
        "chat": 0xE0B7,
        "profile": 0xE853,
    }
    output_dir = MOBILE_IMAGES / "tab-icons-v2"

    for name, codepoint in codepoints.items():
        icon = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
        draw = ImageDraw.Draw(icon)
        glyph = chr(codepoint)
        left, top, right, bottom = draw.textbbox((0, 0), glyph, font=font)
        x = (icon.width - (right - left)) / 2 - left
        y = (icon.height - (bottom - top)) / 2 - top
        draw.text((x, y), glyph, font=font, fill=(0, 0, 0, 255))
        save_png(icon, output_dir / f"{name}.png")


def main() -> None:
    mark = flatten_generated_mark(SOURCE_MARK)

    save_png(place_mark(mark, 1024, 760, (0, 0, 0, 0)), ROOT / "assets/brand/senior-club-mark-v2.png")
    save_png(place_mark(mark, 1024, 720, (*SURFACE, 255)), MOBILE_IMAGES / "senior-club-icon-v2.png")
    # Android adaptive icons guarantee only the central 66/108 region. Keep
    # the mark's taller dimension within 620 px rather than constraining width.
    adaptive = place_mark_max_dimension(mark, 1024, 620, (0, 0, 0, 0))
    save_png(adaptive, MOBILE_IMAGES / "senior-club-adaptive-foreground-v2.png")

    monochrome = Image.new("RGBA", adaptive.size, (0, 0, 0, 0))
    monochrome.paste((*PINE, 255), (0, 0, *adaptive.size), adaptive.getchannel("A"))
    save_png(monochrome, MOBILE_IMAGES / "senior-club-monochrome-v2.png")

    save_png(place_mark(mark, 1024, 760, (0, 0, 0, 0)), MOBILE_IMAGES / "senior-club-splash-v2.png")
    save_png(place_mark(mark, 256, 198, (0, 0, 0, 0)), MOBILE_IMAGES / "senior-club-logo-ui-v2.png")
    save_png(place_mark(mark, 96, 76, (0, 0, 0, 0)), MOBILE_IMAGES / "senior-club-favicon-v2.png")
    save_png(place_mark(mark, 512, 390, (0, 0, 0, 0)), WEB_IMAGES / "senior-club-mark-v2.png")
    save_png(
        place_mark_max_dimension(mark, 512, 360, (*SURFACE, 255)),
        WEB_IMAGES / "senior-club-maskable-v2.png",
    )

    play_icon = place_mark(mark, 512, 360, (*SURFACE, 255))
    save_png(play_icon, STORE_LISTING / "icon-512-v2.png")

    feature = build_feature_graphic(mark)
    save_png(feature, STORE_LISTING / "feature-graphic-1024x500-v2.png")
    save_png(feature, MOBILE_IMAGES / "senior-club-play-feature-v2.png")

    save_optimized_jpeg(SOURCE_HERO, MOBILE_IMAGES / "senior-club-hero-v2.jpg")
    save_optimized_jpeg(SOURCE_GARDEN, MOBILE_IMAGES / "event-gardening-v2.jpg")
    save_optimized_jpeg(SOURCE_CLASSICAL, MOBILE_IMAGES / "event-classical-v2.jpg")
    build_tab_icons()


if __name__ == "__main__":
    main()
