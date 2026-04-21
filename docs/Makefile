# Minimal Sphinx Makefile.
# Builds both EN (root) and KO (ko/) into _build/html/ and _build/html/ko/.
# Usage:
#   make html                         — builds both locales
#   make html SPHINXOPTS="-W --keep-going"   — strict build (CI)

SPHINXBUILD  ?= sphinx-build
SPHINXOPTS   ?=
SOURCEDIR_EN := .
SOURCEDIR_KO := ko
BUILDDIR     := _build

.PHONY: help html clean

help:
	@echo "Targets: html, clean"

html:
	@$(SPHINXBUILD) -b html $(SPHINXOPTS) "$(SOURCEDIR_EN)" "$(BUILDDIR)/html"
	@$(SPHINXBUILD) -b html $(SPHINXOPTS) "$(SOURCEDIR_KO)" "$(BUILDDIR)/html/ko"

clean:
	@rm -rf "$(BUILDDIR)/html"
