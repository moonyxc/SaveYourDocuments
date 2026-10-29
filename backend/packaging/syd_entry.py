"""Einstiegspunkt fuer PyInstaller (der Paketname `syd` bleibt importierbar)."""

import multiprocessing

from syd.main import main

if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
