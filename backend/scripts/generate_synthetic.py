import os
import pandas as pd
import random
import uuid


def create_cldf_structure(base_path, dataset_name):
    os.makedirs(base_path, exist_ok=True)

    # languages.csv
    langs = []
    for i in range(50):
        langs.append(
            {
                "ID": f"L{i}",
                "Name": f"Lang {i}",
                "Latitude": random.uniform(-20, 50),
                "Longitude": random.uniform(-100, 150),
                "Family": random.choice(
                    ["Sino-Tibetan", "Indo-European", "Austronesian", "Mayan"]
                ),
                "ISO639P3": f"abc{i}",
            }
        )
    pd.DataFrame(langs).to_csv(os.path.join(base_path, "languages.csv"), index=False)

    # parameters.csv
    params = []
    for i in range(10):
        params.append(
            {
                "ID": f"P{i}",
                "Name": f"Feature {i}",
                "Description": f"Description for feature {i}",
            }
        )
    pd.DataFrame(params).to_csv(os.path.join(base_path, "parameters.csv"), index=False)

    # forms.csv
    forms = []
    for l in range(50):
        for p in range(random.randint(5, 10)):
            forms.append(
                {
                    "ID": str(uuid.uuid4())[:8],
                    "Language_ID": f"L{l}",
                    "Parameter_ID": f"P{random.randint(0, 9)}",
                    "Form": f"Word_{l}_{p}",
                    "Value": random.choice(["Yes", "No", "Sometimes"]),
                }
            )
    pd.DataFrame(forms).to_csv(os.path.join(base_path, "forms.csv"), index=False)


def create_generic_dataset(base_path, dataset_name, data_type):
    os.makedirs(base_path, exist_ok=True)
    data = []
    for i in range(100):
        lat = random.uniform(-50, 70)
        lon = random.uniform(-180, 180)
        media_url = f"https://picsum.photos/seed/{dataset_name}_{i}/400/300"
        if data_type == "sign_language":
            # Use a sample video for sign language
            media_url = "https://www.w3schools.com/html/mov_bbb.mp4"

        data.append(
            {
                "ID": f"{data_type}_{i}",
                "Name": f"{data_type.capitalize()} Site {i}",
                "Latitude": lat,
                "Longitude": lon,
                "Description": f"Synthetic {data_type} data for {dataset_name}",
                "Media_URL": media_url,
                "Date": f"202{random.randint(0,6)}-01-01",
            }
        )
    pd.DataFrame(data).to_csv(os.path.join(base_path, f"{data_type}.csv"), index=False)


if __name__ == "__main__":
    # Create Sign Language (CLDF format)
    create_cldf_structure(
        "d:/project/lang/data/sign_language/sign_demo_1", "sign_demo_1"
    )

    # Create Archaeology
    create_generic_dataset(
        "d:/project/lang/data/archaeology/arch_demo_1", "arch_demo_1", "archaeology"
    )
    create_generic_dataset(
        "d:/project/lang/data/archaeology/arch_demo_2", "arch_demo_2", "archaeology"
    )

    # Create Genetics
    create_generic_dataset(
        "d:/project/lang/data/genetics/gen_demo_1", "gen_demo_1", "genetics"
    )

    print("Synthetic datasets created successfully.")
