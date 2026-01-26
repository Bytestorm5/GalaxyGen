#!/usr/bin/env python3
"""
random_word_phonemes.py

Generate random "words" by alternating a consonant phoneme and a vowel phoneme
for a randomly chosen number of vowel slots, and randomly choosing whether the
result ends with a consonant.

Outputs IPA-style phoneme strings by default (space-separated for clarity).
Optionally prints a rough orthographic spelling too (very approximate).
"""

from __future__ import annotations

import argparse
import random
from dataclasses import dataclass
from typing import Dict, List, Tuple


# General American-ish consonant phonemes (24)
CONSONANTS: List[str] = [
    "p", "b", "t", "d", "k", "g",
    "tʃ", "dʒ",
    "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h",
    "m", "n", "ŋ",
    "l", "ɹ", "j", "w",
]

# General American-ish vowel phonemes (a practical set)
# (Not exhaustive for every dialect; good enough for random generation.)
VOWELS: List[str] = [
    "i",   # fleece
    "ɪ",   # kit
    "eɪ",  # face
    "ɛ",   # dress
    "æ",   # trap
    "ɑ",   # lot
    "ɔ",   # thought (varies by dialect)
    "oʊ",  # goat
    "ʊ",   # foot
    "u",   # goose
    "ʌ",   # strut
    "ə",   # schwa
    "ɝ",   # nurse (stressed r-colored)
    "ɚ",   # r-colored schwa (unstressed)
    "aɪ",  # price
    "aʊ",  # mouth
    "ɔɪ",  # choice
]

# Optional: very rough spelling hints (many-to-one; English is messy!)
# This is only for "fun" output; it will not be consistent with real English.
IPA_TO_SPELLING: Dict[str, str] = {
    # consonants
    "p": "p", "b": "b", "t": "t", "d": "d", "k": "k", "g": "g",
    "tʃ": "ch", "dʒ": "j",
    "f": "f", "v": "v", "θ": "th", "ð": "th", "s": "s", "z": "z",
    "ʃ": "sh", "ʒ": "zh", "h": "h",
    "m": "m", "n": "n", "ŋ": "ng",
    "l": "l", "ɹ": "r", "j": "y", "w": "w",

    # vowels
    "i": "ee", "ɪ": "i", "eɪ": "ay", "ɛ": "e", "æ": "a",
    "ɑ": "ah", "ɔ": "aw", "oʊ": "oh", "ʊ": "oo", "u": "oo",
    "ʌ": "u", "ə": "uh", "ɝ": "er", "ɚ": "er",
    "aɪ": "ai", "aʊ": "ow", "ɔɪ": "oy",
}


@dataclass(frozen=True)
class WordSpec:
    min_vowels: int = 1
    max_vowels: int = 4
    end_with_consonant_probability: float = 0.5
    seed: int | None = None


def make_word(spec: WordSpec) -> List[str]:
    """
    Build a phoneme sequence with pattern:
      C V (C V)* [optional final C]
    where the number of vowel slots is random in [min_vowels, max_vowels].
    """
    if spec.min_vowels < 1 or spec.max_vowels < spec.min_vowels:
        raise ValueError("min_vowels must be >= 1 and max_vowels must be >= min_vowels")

    n_vowels = random.randint(spec.min_vowels, spec.max_vowels)
    ends_with_c = random.random() < spec.end_with_consonant_probability

    phonemes: List[str] = []
    for i in range(n_vowels):
        phonemes.append(random.choice(CONSONANTS))  # C
        phonemes.append(random.choice(VOWELS))      # V

    if ends_with_c:
        phonemes.append(random.choice(CONSONANTS))

    return phonemes


def to_spelling(phonemes: List[str]) -> str:
    """Very rough IPA->spelling conversion."""
    return "".join(IPA_TO_SPELLING.get(p, p) for p in phonemes)

def generate_random_word() -> str:
    double_vowel = random.choice([True, False])
    if double_vowel:
        spec = WordSpec(min_vowels=2, max_vowels=2, end_with_consonant_probability=0.025)
    else:
        spec = WordSpec(min_vowels=1, max_vowels=1, end_with_consonant_probability=0.975)
    phonemes = make_word(spec)
    ipa = " ".join(phonemes)
    spelling = to_spelling(phonemes)
    #print(f"/{ipa}/   ~ {spelling}")
    return spelling.capitalize()

def generate_random_words(count: int):
    return [generate_random_word() for _ in range(count)]

# def main() -> None:
#     parser = argparse.ArgumentParser(
#         description="Generate random words by alternating consonant and vowel phonemes."
#     )
#     parser.add_argument("-n", "--count", type=int, default=10, help="How many words to generate (default: 10)")
#     parser.add_argument("--min", dest="min_vowels", type=int, default=1, help="Minimum number of vowel slots (default: 1)")
#     parser.add_argument("--max", dest="max_vowels", type=int, default=4, help="Maximum number of vowel slots (default: 4)")
#     parser.add_argument("--endC", dest="endC_prob", type=float, default=0.5,
#                         help="Probability the word ends with a consonant (default: 0.5)")
#     parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducible output")
#     parser.add_argument("--spelling", action="store_true", help="Also print a rough English-ish spelling")

#     args = parser.parse_args()

#     if not (0.0 <= args.endC_prob <= 1.0):
#         raise ValueError("--endC must be between 0 and 1")

#     if args.seed is not None:
#         random.seed(args.seed)

#     spec = WordSpec(
#         min_vowels=args.min_vowels,
#         max_vowels=args.max_vowels,
#         end_with_consonant_probability=args.endC_prob,
#         seed=args.seed,
#     )

#     for _ in range(args.count):
#         phonemes = make_word(spec)
#         ipa = " ".join(phonemes)  # space-separated IPA phonemes for readability

#         if args.spelling:
#             spelling = to_spelling(phonemes)
#             print(f"/{ipa}/   ~ {spelling}")
#         else:
#             print(f"/{ipa}/")
