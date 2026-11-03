"""Lossless projection of canonical summaries onto independent archival profiles."""
from html import escape, unescape
import re


def correct_name(text: str) -> str:
    """Apply the established spelling without changing the preserved source files."""
    for old, new in (("Λυμπανοβνός", "Λιμπανοβνός"),
                     ("Λυμπανοβνό", "Λιμπανοβνό"),
                     ("Lympanovnos", "Limpanovnos")):
        text = text.replace(old, new)
    return text


def normalized(text: str) -> str:
    return re.sub(r"\s+", " ", correct_name(unescape(text))).strip()


def sync_biography(source: str, canonical: str, language: str, *, profile_id: str = "unknown") -> str:
    """Expand an exact/shorter summary, preserving independent archival facts.

    Being equal to a legacy index is not proof that its facts may be deleted.
    Only literal containment (after whitespace/entities and the approved spelling
    correction) permits replacement. Conflicting/richer prose stays untouched.
    """
    if language not in ("el", "en"):
        raise ValueError("Unsupported biography language")
    pattern = (r'(<section\b[^>]*data-profile-language="' + language
               + r'"[^>]*>.*?<div class="bio">)(.*?)(</div>)')

    def expand(match):
        before = normalized(match.group(2))
        after = normalized(canonical)
        if not before or before == after or before not in after:
            return match.group(0)
        return match.group(1) + escape(correct_name(canonical)) + match.group(3)

    updated, count = re.subn(pattern, expand, source, count=1, flags=re.S)
    if normalized(canonical) and count != 1:
        raise ValueError("Missing " + language + " biography section in " + profile_id)
    return correct_name(updated)


def ensure_biography_sections(source: str, canonical_english: str, *, profile_id: str = "unknown") -> str:
    """Adapt the known unscoped root template without rewriting archival prose.

    Existing typed profiles go through the strict projection unchanged. Only the
    legacy root layout is adapted; a damaged typed/archival profile must fail.
    """
    if "data-profile-language=" in source:
        return source
    greek = re.search(r'<div class="bio">.*?</div>', source, flags=re.S)
    if greek is None:
        raise ValueError("Unsectioned profile has no biography div: " + profile_id)
    source = (source[:greek.start()] + '<section class="profile-section" data-profile-language="el">'
              + greek.group(0) + '</section>' + source[greek.end():])
    source, english_count = re.subn(
        r'<section\b([^>]*\blang="en"[^>]*)>',
        r'<section\1 data-profile-language="en">', source, count=1)
    if not english_count and normalized(canonical_english):
        english = ('<section class="profile-section" lang="en" data-profile-language="en" hidden>'
                   '<h2>Biography in English</h2><div class="bio">'
                   + escape(correct_name(canonical_english)) + '</div></section>')
        end = greek.start() + len('<section class="profile-section" data-profile-language="el">') + len(greek.group(0)) + len('</section>')
        source = source[:end] + english + source[end:]
    return source


def include_addenda(source: str, additions: list[dict], language: str, profile_id: str) -> str:
    """Append each new paragraph once, including overlapping/repeated rows."""
    if not additions:
        return source
    if language not in ("el", "en"):
        raise ValueError("Unsupported biography language")
    pattern = (r'(<section\b[^>]*data-profile-language="' + language
               + r'"[^>]*>.*?<div class="bio">)(.*?)(</div>)'
               + r'(?:\s*<p class="profile-addenda-source">(.*?)</p>)?')
    prefix = "Πηγές: " if language == "el" else "Sources: "

    def expand(match):
        body = match.group(2)
        original = normalized(body)
        chosen = []
        for row in additions:
            for paragraph in re.split(r"\n\s*\n", correct_name(row[language])):
                candidate = normalized(paragraph)
                if not candidate or candidate in original:
                    continue
                # Preserve the earlier nested-addendum safeguard: pending
                # shorter paragraphs are covered by a longer verified one,
                # regardless of row order. Original archival prose stays intact.
                if any(candidate in normalized(previous) for previous in chosen):
                    continue
                chosen = [previous for previous in chosen
                          if normalized(previous) not in candidate]
                chosen.append(paragraph.strip())
        for paragraph in chosen:
            body += "\n\n" + escape(paragraph)
        # Retain earlier citations when another batch is applied, and do not
        # repeat the same citation on an idempotent second invocation.
        bibliography = match.group(4) or prefix
        for row in additions:
            label = escape(row["source_label"])
            existing = bibliography.removeprefix(prefix)
            if label and (" · " + label + " · ") not in (" · " + existing + " · "):
                bibliography += ("" if bibliography == prefix else " · ") + label
        return (match.group(1) + body + match.group(3)
                + '<p class="profile-addenda-source">' + bibliography + '</p>')

    updated, count = re.subn(pattern, expand, source, count=1, flags=re.S)
    if count != 1:
        raise ValueError("Missing " + language + " biography section in " + profile_id)
    return updated
