# Extrait l'illustration de chaque carte d'origine (dossier OneDrive) vers assets/art/<id>.png
import os, sys
from PIL import Image, ImageFilter
SRC = r"C:\Users\Cahya\OneDrive - Universite de Montreal\Board game\Images des cartes"
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'art')
G = 'Gemini_Generated_Image_'
M = {
 # Actions
 'veto': ('Actions', G+'rgd41argd41argd4'), 'delegation': ('Actions', G+'ritbuuritbuuritb'), 'placebo': ('Actions', G+'sobwozsobwozsobw'), 'recherche': ('Actions', G+'x4h73zx4h73zx4h7'),
 # Bonnes habitudes
 'sommeil': ('Bonnes habitudes de vie', G+'4gpx9b4gpx9b4gpx'), 'hydratation': ('Bonnes habitudes de vie', G+'5rs8p85rs8p85rs8 (1)'), 'activite': ('Bonnes habitudes de vie', G+'6zkqtu6zkqtu6zkq'),
 'hygiene': ('Bonnes habitudes de vie', G+'h9ye80h9ye80h9ye'), 'meditation': ('Bonnes habitudes de vie', G+'iviubaiviubaiviu'), 'resilience': ('Bonnes habitudes de vie', G+'qab5f4qab5f4qab5'),
 'curiosite': ('Bonnes habitudes de vie', G+'r18ja5r18ja5r18j'), 'reseau': ('Bonnes habitudes de vie', G+'vcthe9vcthe9vcth'), 'stress': ('Bonnes habitudes de vie', G+'vz5n2pvz5n2pvz5n'), 'alimentation': ('Bonnes habitudes de vie', G+'zfy06kzfy06kzfy0'),
 # Génétique
 'cardiaque': ('Facteurs génétiques', 'Antécédant cardiaque'), 'alpha1': ('Facteurs génétiques', 'Déficit Alpha-1-Antitrypsine'), 'ehlers': ('Facteurs génétiques', 'Ehlers-Danlos'),
 'jeune': ('Facteurs génétiques', G+'qkh1z9qkh1z9qkh1'), 'hla': ('Facteurs génétiques', 'Groupe HLA rare'), 'hemochromatose': ('Facteurs génétiques', 'Hémochromatose'),
 'brca': ('Facteurs génétiques', 'Mutation BRCA'), 'metaboliseur': ('Facteurs génétiques', 'Métaboliseur lent'), 'lynch': ('Facteurs génétiques', 'Syndrome de Lynch'), 'senior': ('Facteurs génétiques', 'Sénior'),
 # Aiguës
 'avc': ('Maladie aigue', 'M-AVC ischémique'), 'anaphylaxie': ('Maladie aigue', 'M-Choc anaphylactique'), 'colique': ('Maladie aigue', 'M-Colique néphritique'), 'convulsion': ('Maladie aigue', 'M-Convulsion'),
 'asthme': ('Maladie aigue', "M-Crise d'asthme"), 'dissection': ('Maladie aigue', 'M-Dissection aortique'), 'embolie': ('Maladie aigue', 'M-Embolie pulmonaire'), 'endocardite': ('Maladie aigue', 'M-Endocardite'),
 'erysipele': ('Maladie aigue', 'M-Erisypèle'), 'gastro': ('Maladie aigue', 'M-Gastroentérite'), 'hemorragie': ('Maladie aigue', 'M-Hémorragie digestive'), 'infarctus': ('Maladie aigue', 'M-Infarctus'),
 'co': ('Maladie aigue', 'M-Intoxication CO'), 'meningite': ('Maladie aigue', 'M-Méningite'), 'sepsis': ('Maladie aigue', 'M-Sepsis urinaire'), 'pancreatite': ('Maladie aigue', 'M-pancréatite aigue'),
 # Chroniques
 'cirrhose': ('Maladie chronique', 'MC-Cirrhose'), 'crohn': ('Maladie chronique', 'MC-Crohn'), 'diabete': ('Maladie chronique', 'MC-Diabète type 2'), 'hta': ('Maladie chronique', 'MC-HTA'),
 'ic': ('Maladie chronique', 'MC-Insuffisance cardiaque'), 'renale': ('Maladie chronique', 'MC-Insuffisance rénale'), 'mpoc': ('Maladie chronique', 'MC-MPOC'), 'par': ('Maladie chronique', 'MC-PAR'),
 'parkinson': ('Maladie chronique', 'MC-Parkinson'), 'depression': ('Maladie chronique', 'MC-dépression'),
 # Mauvaises habitudes
 'alcoolisme': ('Mauvaises habitudes de vie', 'Alcoolisme'), 'deni': ('Mauvaises habitudes de vie', 'Déni de la maladie'), 'insomnie': ('Mauvaises habitudes de vie', 'Insomnie'), 'isolement': ('Mauvaises habitudes de vie', 'Isolement'),
 'malbouffe': ('Mauvaises habitudes de vie', 'Malbouffe'), 'negligence': ('Mauvaises habitudes de vie', 'Négligence'), 'stresschro': ('Mauvaises habitudes de vie', 'Stress Chronique'), 'surmenage': ('Mauvaises habitudes de vie', 'Surmenage'),
 'sedentarite': ('Mauvaises habitudes de vie', 'Sédentarité'), 'tabagisme': ('Mauvaises habitudes de vie', 'Tabagisme'),
 # Médication
 'regulateur': ('Médicament', G+'3138r33138r33138'), 'immunomodulateur': ('Médicament', G+'e871tse871tse871'), 'vasodilatateur': ('Médicament', G+'u6rd5zu6rd5zu6rd'), 'ains': ('Médicament', G+'y8nbt4y8nbt4y8nb'),
 # Soins critiques
 'chirurgie': ('Soin critique', G+'ky8wwqky8wwqky8w'), 'dialyse': ('Soin critique', G+'xjxaj9xjxaj9xjxa'),
 # Soins immédiats
 'adrenaline': ('Soin Immédiat', 'TA-Adrénaline'), 'antibio': ('Soin Immédiat', 'TA-Antibio IV'), 'cortico': ('Soin Immédiat', 'TA-Cortico'), 'oxygene': ('Soin Immédiat', 'TA-Oxygénothérapie'),
 'solute': ('Soin Immédiat', 'TA-Soluté IV'), 'support': ('Soin Immédiat', 'TA-Traitement support'), 'transfusion': ('Soin Immédiat', 'TA-Transfusion'),
}
SUB = {'Maladie aigue', 'Maladie chronique', 'Médicament', 'Soin critique', 'Soin Immédiat'}
os.makedirs(OUT, exist_ok=True)
for cid, (folder, name) in M.items():
    im = Image.open(os.path.join(SRC, folder, name + '.png')).convert('RGB')
    w, h = im.size
    y0, y1 = (0.180, 0.548) if folder in SUB else (0.146, 0.552)
    box = (round(w * 0.128), round(h * y0), round(w * 0.872), round(h * y1))
    art = im.crop(box)
    if w < 1200:  # sources basse définition : agrandissement x2 + légère accentuation
        art = art.resize((art.width * 2, art.height * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
    art.save(os.path.join(OUT, cid + '.png'))
    print(cid, art.size)
