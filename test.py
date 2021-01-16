import os, sys, re

PATTERN = open(sys.argv[1]).read().strip()
DIRECTORY = sys.argv[2]

for folder, subFolders, files in os.walk(DIRECTORY):
  for file in files:
    name = os.path.join(folder, file)
    # print(name)

    try:
      with open(name) as f:
        d = f.read()
        if PATTERN in d:
          exit(0)
    except UnicodeDecodeError:
      pass
    except FileNotFoundError:
      pass
      
exit(1)