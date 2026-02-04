import os
import csv

DATA_ROOT = "d:/project/lang/data"
SPOKEN_LANG_DIR = os.path.join(DATA_ROOT, "spoken_language")
OUTPUT_CSV = os.path.join(DATA_ROOT, "concepticon_gloss_index.csv")
DISTINCT_GLOSS_CSV = os.path.join(DATA_ROOT, "distinct_concepticon_glosses.csv")


def generate_csv_index():
    if not os.path.exists(SPOKEN_LANG_DIR):
        print(f"Directory {SPOKEN_LANG_DIR} does not exist.")
        return

    datasets = [
        d
        for d in os.listdir(SPOKEN_LANG_DIR)
        if os.path.isdir(os.path.join(SPOKEN_LANG_DIR, d))
    ]

    all_glosses_global = set()

    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["dataset_name", "Concepticon_Gloss"])

        count = 0
        for dataset in datasets:
            params_csv = os.path.join(SPOKEN_LANG_DIR, dataset, "parameters.csv")
            if os.path.exists(params_csv):
                try:
                    with open(params_csv, mode="r", encoding="utf-8") as f:
                        reader = csv.DictReader(f)
                        glosses = set()
                        for row in reader:
                            gloss = row.get("Concepticon_Gloss")
                            if gloss:
                                glosses.add(gloss)
                                all_glosses_global.add(gloss)

                        for gloss in sorted(list(glosses)):
                            writer.writerow([dataset, gloss])
                            count += 1
                except Exception as e:
                    print(f"Error processing {dataset}: {e}")

    print(f"Generated {OUTPUT_CSV} with {count} entries.")

    # Generate distinct glosses CSV
    with open(DISTINCT_GLOSS_CSV, "w", encoding="utf-8", newline="") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["Concepticon_Gloss"])
        for gloss in sorted(list(all_glosses_global)):
            writer.writerow([gloss])

    print(
        f"Generated {DISTINCT_GLOSS_CSV} with {len(all_glosses_global)} unique glosses."
    )


if __name__ == "__main__":
    generate_csv_index()
