# Evaluation media

Fixtures for the photo and voice-note paths. Neither is used by `npm run eval`; both are sent by
`npm run test:multimodal`, which runs the real extraction against them.

Both are **synthesised here**, so there is no licence question and no risk of a real person's
photograph or voice ending up in the repository. Both are labelled synthetic wherever they appear.

## `landslide-larcha.png` — 1024×768

An illustration of the demo scenario, not a photograph. It is drawn to be read, not to deceive:
the stylised shapes carry a visible `ILLUSTRATION · SYNTHETIC · NOT A REAL PHOTOGRAPH` label, so
it cannot be mistaken for a real image of a real event if it is ever shown outside a test.

Regenerate after editing `landslide-larcha.source.html`:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --hide-scrollbars --window-size=1024,768 \
  --screenshot="$(pwd)/data/eval/media/landslide-larcha.png" \
  "file://$(pwd)/data/eval/media/landslide-larcha.source.html"
```

## `voice-landslide-larcha.wav` — 16 kHz mono, ~8.8 s

Nepali speech synthesised by the macOS `Lekha` voice, saying that a landslide came down on the
Arniko Highway last night, that the road near Larcha is completely blocked, and that no vehicle
has been able to get through. That is the §12 scenario, spoken rather than typed, so the transcript
path can be checked against claims that are actually in the audio.

Regenerate:

```bash
cat > /tmp/voicenote.txt <<'EOF'
हिजो राति अरनिको राजमार्गमा ठूलो पहिरो गयो। लार्चा गाउँ नजिकै बाटो पूरै अवरुद्ध भएको छ। अहिले कुनै सवारी आउन सकेको छैन।
EOF
say -v Lekha -f /tmp/voicenote.txt -o /tmp/voicenote.aiff
afconvert -f WAVE -d LEI16@16000 -c 1 /tmp/voicenote.aiff data/eval/media/voice-landslide-larcha.wav
```

## Still open

`project.md` §15 question 3: which image the **demo** uses. This illustration is good enough to
prove the pipeline, but a demo video wants a real photograph of a landslide, openly licensed and
attributed, and labelled as not being a picture of this event. Drop it in here and point the
scenario at it.
