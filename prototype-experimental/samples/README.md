# Documents de test

Placer ici un PDF pédagogique contenant du texte sélectionnable, par exemple
`cours.pdf`. Aucun PDF n'est fourni : utiliser un document que le groupe est
autorisé à transmettre à l'API, sans données personnelles d'élèves.

Les PDF de ce dossier sont ignorés par Git. Prévoir un cours assez riche pour
5 questions distinctes. Le prototype ne lit pas les images ou scans par OCR.

Depuis la racine du dépôt :

```bash
python prototype-experimental/main.py prototype-experimental/samples/cours.pdf --extract-only
```
