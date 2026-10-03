# Prépare les images intermédiaires pour les PDF d'impression :
#   impression/_work/jpg600 : cartes avec fond perdu (JPEG qualité 93, 600 ppp)
#   impression/_work/jpg300 : cartes au format fini 63 x 88 mm, 300 ppp (planches à imprimer soi-même)
import glob, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'impression')
for d in ('jpg600', 'jpg300'):
    os.makedirs(os.path.join(ROOT, '_work', d), exist_ok=True)
files = glob.glob(os.path.join(ROOT, 'cartes', 'recto', '*.png')) + glob.glob(os.path.join(ROOT, 'cartes', 'verso', '*.png'))
for f in files:
    name = os.path.splitext(os.path.basename(f))[0]
    im = Image.open(f).convert('RGB')
    im.save(os.path.join(ROOT, '_work', 'jpg600', name + '.jpg'), quality=93, dpi=(600, 600))
    w, h = im.size
    bx, by = round(w * 3 / 69), round(h * 3 / 94)  # 3 mm de fond perdu
    im.crop((bx, by, w - bx, h - by)).resize((744, 1039), Image.LANCZOS).save(os.path.join(ROOT, '_work', 'jpg300', name + '.jpg'), quality=90, dpi=(300, 300))
    # inscrit la résolution dans le PNG d'origine
    Image.open(f).save(f, dpi=(600, 600))
print(len(files), 'images préparées')
