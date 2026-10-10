// Reading names: splits folder and file names into words, matches words and phrases against the vocabulary the job
// sends (never a list compiled in), and finds a tempo or key written in a name ("128 BPM", "Am", "F# minor").
// Everything here is a claim made by whoever named the file; classify.rs decides how much it counts.
use std::collections::BTreeMap;

/// Words of one name, in order, keeping `#` (for keys): "Kick01_128bpm" → Kick, 01, 128, bpm.
pub fn tokens(name: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut prev: Option<char> = None;
    for c in name.chars() {
        let keep = c.is_alphanumeric() || c == '#' || c == '♯' || c == '♭';
        if !keep {
            if !cur.is_empty() {
                out.push(std::mem::take(&mut cur));
            }
            prev = None;
            continue;
        }
        if let Some(p) = prev {
            let boundary = (p.is_lowercase() && c.is_uppercase() && cur.chars().count() > 1)
                || (p.is_ascii_digit() && c.is_alphabetic())
                || (p.is_alphabetic() && c.is_ascii_digit());
            if boundary && !cur.is_empty() {
                out.push(std::mem::take(&mut cur));
            }
        }
        cur.push(c);
        prev = Some(c);
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// A word as the vocabulary writes it: lower case, `#` as `s`, accents dropped.
pub fn fold(word: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    word.nfkd()
        .filter(|c| c.is_ascii())
        .map(|c| if c == '#' { 's' } else { c.to_ascii_lowercase() })
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

/// The vocabulary values named in these words, longest phrase first ("one shots" → one-shots, "hi hat" → hats), with
/// the words that matched. Each value once.
pub fn matches(words: &[String], table: &BTreeMap<String, String>) -> Vec<(String, String)> {
    let folded: Vec<String> = words.iter().map(|w| fold(w)).collect();
    let mut out: Vec<(String, String)> = Vec::new();
    let mut i = 0;
    while i < folded.len() {
        let mut hit = None;
        for n in (1..=3).rev() {
            if i + n > folded.len() {
                continue;
            }
            let phrase = folded[i..i + n].join("-");
            if let Some(v) = table.get(&phrase) {
                hit = Some((n, v.clone(), words[i..i + n].join(" ")));
                break;
            }
        }
        match hit {
            Some((n, v, said)) => {
                if !out.iter().any(|(x, _)| *x == v) {
                    out.push((v, said));
                }
                i += n;
            }
            None => i += 1,
        }
    }
    out
}

/// A tempo written in a name. `marked`: next to "bpm" ("128 BPM", "bpm128"); otherwise a bare number that could be one.
#[derive(Debug, Clone, PartialEq)]
pub struct Tempo {
    pub bpm: f64,
    pub marked: bool,
    pub said: String,
}

pub fn tempos(words: &[String]) -> Vec<Tempo> {
    let num = |w: &str| -> Option<f64> {
        if w.is_empty() || w.len() > 3 || w.starts_with('0') || !w.chars().all(|c| c.is_ascii_digit()) {
            return None;
        }
        w.parse().ok()
    };
    let mut out = Vec::new();
    for (i, w) in words.iter().enumerate() {
        let Some(n) = num(w) else { continue };
        let marked = words.get(i + 1).is_some_and(|x| fold(x) == "bpm") || (i > 0 && fold(&words[i - 1]) == "bpm");
        let said = if marked { format!("{w} bpm") } else { w.clone() };
        out.push(Tempo { bpm: n, marked, said });
    }
    out
}

const NOTES: [&str; 12] = ["c", "cs", "d", "ds", "e", "f", "fs", "g", "gs", "a", "as", "b"];

/// A key written in a name, as the vocabulary writes keys ("a-minor", "cs-major"), with the words that said it. Only
/// with a mode ("Am", "C#min", "Db major"): a bare note is too often something else.
pub fn keys(words: &[String]) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for (i, w) in words.iter().enumerate() {
        let mut chars = w.chars();
        let Some(letter) = chars.next() else { continue };
        let base = match letter.to_ascii_lowercase() {
            'c' => 0,
            'd' => 2,
            'e' => 4,
            'f' => 5,
            'g' => 7,
            'a' => 9,
            'b' => 11,
            _ => continue,
        };
        let rest: String = chars.collect();
        let (shift, suffix) = match rest.chars().next() {
            Some('#') | Some('♯') => (1, &rest[rest.chars().next().unwrap().len_utf8()..]),
            Some('♭') => (-1, &rest['♭'.len_utf8()..]),
            Some('b') if rest.len() == 1 || !rest[1..].starts_with('a') => (-1, &rest[1..]),
            _ => (0, rest.as_str()),
        };
        let mode_of = |s: &str| match s.to_ascii_lowercase().as_str() {
            "min" | "minor" => Some("minor"),
            "maj" | "major" => Some("major"),
            _ => None,
        };
        let (mode, said) = match suffix {
            "m" if letter.is_uppercase() => (Some("minor"), w.clone()),
            "" => match words.get(i + 1).and_then(|n| mode_of(n)) {
                Some(m) => (Some(m), format!("{w} {}", words[i + 1])),
                None => (None, String::new()),
            },
            s => (mode_of(s), w.clone()),
        };
        let Some(mode) = mode else { continue };
        let note = NOTES[((base + shift + 12) % 12) as usize];
        let value = format!("{note}-{mode}");
        if !out.iter().any(|(v, _)| *v == value) {
            out.push((value, said));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(s: &str) -> Vec<String> {
        tokens(s)
    }

    #[test]
    fn splits_names_into_words() {
        assert_eq!(t("Kick01_128bpm"), ["Kick", "01", "128", "bpm"]);
        assert_eq!(t("KickDrum - Hard.wav"), ["Kick", "Drum", "Hard", "wav"]);
        assert_eq!(t("Vox Chop C#m"), ["Vox", "Chop", "C#m"]);
        assert_eq!(t("808 Sub"), ["808", "Sub"]);
    }

    #[test]
    fn matches_phrases_from_the_vocabulary() {
        let table: BTreeMap<String, String> = [("one-shots", "one-shots"), ("hi-hat", "hats"), ("kicks", "kick")]
            .iter()
            .map(|(a, b)| (a.to_string(), b.to_string()))
            .collect();
        let m = matches(&t("One Shots Hi Hat Kicks"), &table);
        assert_eq!(
            m,
            vec![
                ("one-shots".into(), "One Shots".into()),
                ("hats".into(), "Hi Hat".into()),
                ("kick".into(), "Kicks".into())
            ]
        );
    }

    #[test]
    fn tempo_written_in_names() {
        let ts = tempos(&t("Groove 128 BPM 02"));
        assert_eq!(
            ts[0],
            Tempo {
                bpm: 128.0,
                marked: true,
                said: "128 bpm".into()
            }
        );
        assert_eq!(ts.len(), 1, "a numbered take is not a tempo");
        assert!(!tempos(&t("Bass Loop 140"))[0].marked);
        assert!(tempos(&t("bpm140"))[0].marked);
    }

    #[test]
    fn keys_need_a_mode() {
        assert_eq!(keys(&t("Groove 128 Am")), vec![("a-minor".into(), "Am".into())]);
        assert_eq!(keys(&t("Pad C#min")), vec![("cs-minor".into(), "C#min".into())]);
        assert_eq!(keys(&t("Lead Db major")), vec![("cs-major".into(), "Db major".into())]);
        assert_eq!(keys(&t("Bbm Chords"))[0].0, "as-minor");
        assert!(keys(&t("Bass A 120")).is_empty(), "a bare note is not a key");
        assert!(keys(&t("i am here")).is_empty(), "lower-case 'am' is a word");
        assert!(keys(&t("Bass Loop")).is_empty());
    }
}
