import whisper
import json
import os

model = whisper.load_model("base")  
audios = os.listdir("audios")
os.makedirs("jsons", exist_ok=True)

for audio in audios:
    if "_" in audio:
        number = audio.split("_")[0]
        title = audio.split("_")[1][:-4]

        print("Processing:", audio)

        result = model.transcribe(
            audio=f"audios/{audio}",
            task="translate"
        )

        print("Segments:", result.get("segments"))

        chunks = []

        if result.get("segments"):
            for segment in result["segments"]:
                chunks.append({
                    "number": number,
                    "title": title,
                    "start": segment["start"],
                    "end": segment["end"],
                    "text": segment["text"]
                })
        else:
            print("⚠️ No segments found, creating fallback chunk")
            chunks.append({
                "number": number,
                "title": title,
                "start": 0,
                "end": 0,
                "text": result.get("text", "")
            })

        with open(f"jsons/{audio}.json", "w", encoding="utf-8") as f:
            json.dump({"chunks": chunks, "text": result.get("text", "")}, f, indent=4)