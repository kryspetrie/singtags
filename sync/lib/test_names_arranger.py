"""Tests for arranger normalization / splitting."""

from lib.names import normalize_arranger, split_arranger_names


def test_preserves_commas_and_splits():
    raw = "Adam Scott, Jay Dougherty and Lucas Bitzer"
    assert normalize_arranger(raw) == "Adam Scott, Jay Dougherty and Lucas Bitzer"
    assert split_arranger_names(raw) == ["Adam Scott", "Jay Dougherty", "Lucas Bitzer"]


def test_ampersand_split():
    assert split_arranger_names("Brandon Hall & Nathan Menke") == [
        "Brandon Hall",
        "Nathan Menke",
    ]


def test_strips_lyrics_tail():
    assert normalize_arranger("Paul Olguin, Lyrics by William Hill") == "Paul Olguin"
    assert split_arranger_names("Paul Olguin, Lyrics by William Hill") == ["Paul Olguin"]


def test_sanitize_segment_still_strips_commas_for_paths():
    from lib.names import sanitize_segment

    # Path sanitizer intentionally removes commas — do not use it for metadata.
    assert "," not in (sanitize_segment("Adam Scott, Jay Dougherty") or "")


def test_jr_suffix_not_split():
    assert split_arranger_names("Bobby Gray, Jr.") == ["Bobby Gray, Jr."]
