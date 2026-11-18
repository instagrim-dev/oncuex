#!/usr/bin/env python3
"""Generate the OnCueX demo deck as a native PowerPoint file.

Mirrors submission/demo-slides.html: same fourteen slides, same argument,
same palette. Everything is native shapes and text boxes, so the deck stays
editable in PowerPoint, Keynote and Google Slides.

    python3 tools/build_deck.py
"""

from __future__ import annotations

import os

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt
from pptx.oxml.ns import qn

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "submission", "oncuex-demo.pptx")

# ------------------------------------------------------------------ palette
PAPER = RGBColor(0xF6, 0xF4, 0xEF)
INK = RGBColor(0x10, 0x11, 0x1A)
INK_SOFT = RGBColor(0x3D, 0x40, 0x56)
INK_FAINT = RGBColor(0x6B, 0x6E, 0x82)
RULE = RGBColor(0xD9, 0xD5, 0xCB)
ACCENT = RGBColor(0x8B, 0x3A, 0x2F)
GOOD = RGBColor(0x2F, 0x5D, 0x4A)
WARN = RGBColor(0x9A, 0x6A, 0x1E)

SERIF = "Georgia"
MONO = "Courier New"

# ------------------------------------------------------------------ geometry
SW, SH = 13.333, 7.5
ML = 0.62
CW = SW - 2 * ML
FOOT_Y = 6.86
RULE_Y = 6.74


def slide_blank(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def bg(slide, color=PAPER):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def spacing(run, hundredths: int) -> None:
    """Character spacing, in 1/100 pt, set on the run properties."""
    run.font._rPr.set("spc", str(hundredths))


def text(
    slide,
    s: str,
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    size: float = 14,
    color=INK_SOFT,
    bold: bool = False,
    italic: bool = False,
    font: str = SERIF,
    spacing_pt: int = 0,
    line: float = 1.28,
    align=PP_ALIGN.LEFT,
    anchor=MSO_ANCHOR.TOP,
    space_after: float = 0,
):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    tf.auto_size = None

    lines = s.split("\n")
    for index, line_text in enumerate(lines):
        para = tf.paragraphs[0] if index == 0 else tf.add_paragraph()
        para.alignment = align
        para.line_spacing = line
        para.space_after = Pt(space_after)
        para.space_before = Pt(0)
        run = para.add_run()
        run.text = line_text
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.italic = italic
        run.font.name = font
        run.font.color.rgb = color
        if spacing_pt:
            spacing(run, spacing_pt)
    return box


def hline(slide, x: float, y: float, w: float, color=RULE, weight: float = 1.0):
    line = slide.shapes.add_shape(1, Inches(x), Inches(y), Inches(w), Pt(weight))
    line.fill.solid()
    line.fill.fore_color.rgb = color
    line.line.fill.background()
    line.shadow.inherit = False
    return line


def card(slide, x, y, w, h, *, tint=None, edge=RULE, edge_w=0.75):
    shape = slide.shapes.add_shape(1, Inches(x), Inches(y), Inches(w), Inches(h))
    if tint is None:
        shape.fill.background()
    else:
        shape.fill.solid()
        shape.fill.fore_color.rgb = tint
    shape.line.color.rgb = edge
    shape.line.width = Pt(edge_w)
    shape.shadow.inherit = False
    return shape


def eyebrow(slide, s: str, y: float = 0.52):
    text(slide, s.upper(), ML, y, CW, 0.26, size=9, color=INK_FAINT,
         font=MONO, spacing_pt=180)


def h2(slide, s: str, y: float = 1.0, size: float = 32, w: float = 11.6):
    return text(slide, s, ML, y, w, 1.5, size=size, color=INK, line=1.14)


def footer(slide, n: int):
    hline(slide, ML, RULE_Y, CW)
    text(slide, "OnCueX", ML, FOOT_Y, 5, 0.22, size=8, color=INK_FAINT,
         font=MONO, spacing_pt=120)
    text(slide, f"{n} / 14", SW - ML - 1.6, FOOT_Y, 1.6, 0.22, size=8,
         color=INK_FAINT, font=MONO, spacing_pt=120, align=PP_ALIGN.RIGHT)


def notes(slide, s: str):
    slide.notes_slide.notes_text_frame.text = s


def table(slide, rows: list[tuple[str, str]], y: float, *, col1: float = 3.9,
          size: float = 12.5, head: tuple[str, str] | None = None) -> float:
    """Header rule, row rules, two columns. Returns the y after the table."""
    x2 = ML + col1
    w2 = CW - col1
    cursor = y

    if head:
        text(slide, head[0], ML, cursor, col1 - 0.2, 0.26, size=size - 1.5,
             color=INK, bold=True)
        text(slide, head[1], x2, cursor, w2, 0.26, size=size - 1.5,
             color=INK, bold=True)
        cursor += 0.3
        hline(slide, ML, cursor, CW, INK, 1.4)
        cursor += 0.14

    for index, (left, right) in enumerate(rows):
        text(slide, left, ML, cursor, col1 - 0.22, 0.62, size=size,
             color=INK, line=1.2)
        text(slide, right, x2, cursor, w2, 0.62, size=size,
             color=INK_SOFT, line=1.2)
        cursor += 0.52
        if index < len(rows) - 1:
            hline(slide, ML, cursor - 0.09, CW, RULE)
    return cursor


def build() -> str:
    prs = Presentation()
    prs.slide_width = Inches(SW)
    prs.slide_height = Inches(SH)

    # ---------------------------------------------------------------- 1 title
    s = slide_blank(prs); bg(s)
    eyebrow(s, "Converge AI · Stanford · OnCueX", y=2.05)
    text(s, "Readiness is computed.", ML, 2.45, 11.4, 0.9, size=50, color=INK, line=1.06)
    text(s, "Approval is not.", ML, 3.32, 11.4, 0.9, size=50, color=INK, line=1.06)
    text(s,
         "An event launch tool that keeps a sign-off tied to the evidence behind it\n"
         "— and tells you the moment that evidence moves.",
         ML, 4.42, 9.6, 1.1, size=17, color=INK_SOFT, line=1.42)
    footer(s, 1)
    notes(s, "One sentence to open: this is about the difference between work being "
             "complete and the plan being supportable. Everything else follows from that.")

    # ---------------------------------------------------------------- 2 problem
    s = slide_blank(prs); bg(s)
    eyebrow(s, "The problem")
    h2(s, "A checked box is not evidence.")
    text(s, "Every launch tool can show you a task list with ticks through it.\n"
            "None of them can tell you whether the plan underneath still holds.",
         ML, 2.28, 10.4, 1.0, size=17, color=INK_SOFT, line=1.42)
    hline(s, ML, 3.52, CW)
    text(s, "The obvious failure", ML, 3.78, 5.4, 0.3, size=14, color=INK, bold=True)
    text(s, "Requirements are marked done while nothing current supports them.\n"
            "Access windows, crew calls, run of show and committed cost quietly\n"
            "disagree with each other.",
         ML, 4.18, 5.4, 1.5, size=12.5, color=INK_SOFT, line=1.42)
    text(s, "The embarrassing one", 7.0, 3.78, 5.6, 0.3, size=14, color=INK, bold=True)
    text(s, "The venue changes. Some commitments lose their support and others\n"
            "don't. The approval granted before the change still looks current —\n"
            "and nobody can say which parts are still true.",
         7.0, 4.18, 5.6, 1.5, size=12.5, color=INK_SOFT, line=1.42)
    footer(s, 2)
    notes(s, "The second one is what the product exists for. The first is a checklist "
             "problem; the second is an integrity problem, and no checklist catches it.")

    # ---------------------------------------------------------------- 3 scenario
    s = slide_blank(prs); bg(s)
    eyebrow(s, "The scenario")
    h2(s, "One fictional launch, moved once.")
    kv = [
        ("CLIENT", "Northwind Provisions — spring launch reception"),
        ("GUESTS", "120 · fixed"),
        ("BUDGET", "$30,000 approved · fixed"),
        ("DATE", "14 March 2027"),
        ("VENUE A", "Foundry Hall — access 05:00–12:00, occupancy 150, stop 23:00"),
    ]
    y = 2.3
    for label, value in kv:
        text(s, label, ML, y, 1.5, 0.26, size=9, color=INK_FAINT, font=MONO, spacing_pt=70)
        text(s, value, ML + 1.62, y - 0.035, 9.9, 0.3, size=13, color=INK)
        y += 0.44
    hline(s, ML, 4.66, CW)
    text(s, "The venue moves to Pier 9 Loft: access narrows to 06:00–07:30, occupancy\n"
            "drops to 110, the stop moves to 21:30, and the total rises to $31,450.",
         ML, 4.92, 10.4, 0.9, size=13.5, color=INK_SOFT, line=1.42)
    text(s, "All people, venues and prices are fictional.", ML, 5.92, 8, 0.3,
         size=11, color=INK_FAINT, italic=True)
    footer(s, 3)
    notes(s, "Guests and budget are fixed on purpose: the change must not be absorbable "
             "by quietly adjusting scope.")

    # ---------------------------------------------------------------- 4 conditions
    s = slide_blank(prs); bg(s)
    eyebrow(s, "What the move breaks")
    h2(s, "Five conditions fail at once. A sixth check reports the rest.", size=29)
    rows = [
        ("Access vs crew arrival", "07:15 arrival + 45 min setup reaches 08:00; access ends 07:30"),
        ("Occupancy vs headcount", "Licensed 110 is below 120 guests + 10 circulation"),
        ("Run of show vs hard stop", "22:00 end + 30 min margin needs 22:30; stop is 21:30"),
        ("Committed total", "$31,450 against a $30,000 approval"),
        ("Attestation current", "Fire attestation belongs to Venue A, not Venue B"),
        ("Dependency closure", "Six blocking requirements are unsupported"),
    ]
    table(s, rows, 2.42, col1=3.55, size=12, head=("CHECK", "THE CONFLICTING VALUES"))
    text(s, "The set is always six. A failure names the values that disagree — never a percentage.",
         ML, 6.28, 11.5, 0.3, size=11, color=INK_FAINT, italic=True)
    footer(s, 4)
    notes(s, "This is the slide that earns trust: every line is a specific pair of numbers "
             "that cannot both be true. No scores, no confidence.")

    # ---------------------------------------------------------------- 5 computed
    s = slide_blank(prs); bg(s)
    eyebrow(s, "The central distinction")
    h2(s, "Readiness is computed. Acceptance is recorded.")
    card(s, ML, 2.42, 5.86, 2.28, tint=RGBColor(0xFB, 0xFA, 0xF6))
    text(s, "COMPUTED", ML + 0.3, 2.62, 5, 0.24, size=8.5, color=INK_FAINT, font=MONO, spacing_pt=120)
    text(s, "Readiness", ML + 0.3, 2.92, 5.2, 0.3, size=15, color=INK, bold=True)
    text(s, "A pure function over one snapshot. Returns missing, blocked,\n"
            "outdated or supported with a named reason for each.\n"
            "No model in the loop.",
         ML + 0.3, 3.3, 5.3, 1.2, size=12, color=INK_SOFT, line=1.4)

    card(s, 6.92, 2.42, 5.86, 2.28, tint=RGBColor(0xFB, 0xFA, 0xF6))
    text(s, "RECORDED", 7.22, 2.62, 5, 0.24, size=8.5, color=INK_FAINT, font=MONO, spacing_pt=120)
    text(s, "Acceptance", 7.22, 2.92, 5.2, 0.3, size=15, color=INK, bold=True)
    text(s, "Exists only as a decision by a named project manager against\n"
            "one revision, one requirement set and one evidence set.\n"
            "The evaluator can never emit it.",
         7.22, 3.3, 5.3, 1.2, size=12, color=INK_SOFT, line=1.4)

    hline(s, ML, 5.06, CW)
    text(s, "A green badge can never impersonate a person.",
         ML + 0.05, 5.3, 10, 0.4, size=17, color=ACCENT, italic=True)
    footer(s, 5)
    notes(s, "If a judge remembers one thing, it should be this sentence. Readiness is "
             "arithmetic; approval is a signature.")

    # ---------------------------------------------------------------- 6 counters
    s = slide_blank(prs); bg(s)
    eyebrow(s, "Why it's built this way")
    h2(s, "Two counters, because an opinion is not a fact.")
    text(s, "Recording a sign-off must not invalidate the sign-off.\n"
            "That single sentence drives the storage design.",
         ML, 2.26, 10.2, 0.9, size=16.5, color=INK_SOFT, line=1.42)
    table(s,
          [("eventSequence", "every event, including a sign-off"),
           ("assessmentRevision", "only changes to assessed facts")],
          3.36, col1=3.5, size=12.5,
          head=("COUNTER", "ADVANCES ON"))
    text(s, "Sign-off advances the first and leaves the second alone — so it is current\n"
            "the instant it is written, and still current after a reload.",
         ML, 5.16, 10.4, 0.8, size=13.5, color=INK_SOFT, line=1.42)
    text(s, "Earlier versions bound decisions to a single revision and staled every approval on write.",
         ML, 6.06, 11, 0.3, size=11, color=INK_FAINT, italic=True)
    footer(s, 6)
    notes(s, "This was the first defect found in external review. It is worth naming "
             "openly — it shows the review was real.")

    # ---------------------------------------------------------------- 7 impact
    s = slide_blank(prs); bg(s)
    eyebrow(s, "What survives the change")
    h2(s, "Impact comes from declared bindings, not a diff.")
    text(s, "Each requirement declares the fields it depends on. Each evidence record\n"
            "records the values it was bound to. A change walks those declarations,\n"
            "then closes over the prerequisite graph.",
         ML, 2.26, 10.6, 1.2, size=13.5, color=INK_SOFT, line=1.42)

    card(s, ML, 3.72, 5.86, 1.72, tint=RGBColor(0xFB, 0xF7, 0xF6), edge=ACCENT, edge_w=1.6)
    text(s, "6 REQUIREMENTS · 6 RECORDS", ML + 0.28, 3.9, 5.2, 0.24, size=8.5,
         color=INK_FAINT, font=MONO, spacing_pt=110)
    text(s, "Work to revisit", ML + 0.28, 4.18, 5.2, 0.3, size=14.5, color=INK, bold=True)
    text(s, "Loading, capacity, crew arrival, run of show, budget, fire attestation.",
         ML + 0.28, 4.55, 5.3, 0.7, size=11.5, color=INK_SOFT, line=1.4)

    card(s, 6.92, 3.72, 5.86, 1.72, tint=RGBColor(0xF6, 0xFA, 0xF7), edge=GOOD, edge_w=1.6)
    text(s, "1 REQUIREMENT · 1 RECORD", 7.2, 3.9, 5.2, 0.24, size=8.5,
         color=INK_FAINT, font=MONO, spacing_pt=110)
    text(s, "Keep as it is", 7.2, 4.18, 5.2, 0.3, size=14.5, color=INK, bold=True)
    text(s, "Photographer delivers 120 edited images within 10 days.\n"
            "Binds to no venue field.",
         7.2, 4.55, 5.3, 0.7, size=11.5, color=INK_SOFT, line=1.4)

    text(s, "Marking the photographer outdated is a defect, and a test fails if it happens.",
         ML, 5.72, 11.4, 0.3, size=11, color=INK_FAINT, italic=True)
    footer(s, 7)
    notes(s, "The right-hand card is the proof. A blanket reset would be easier to build "
             "and would be wrong; the test that catches it is the interesting part.")

    # ---------------------------------------------------------------- 8 interface
    s = slide_blank(prs); bg(s)
    eyebrow(s, "The interface")
    h2(s, "The launch, not the system's reasoning about it.")
    text(s, "Five tabs a producer would actually open. The engine sits underneath\n"
            "and surfaces only where a decision is needed.",
         ML, 2.26, 10.2, 0.9, size=13.5, color=INK_SOFT, line=1.42)

    tiles = [
        ("OVERVIEW", "The day at a glance", "Next work, the team,\nbudget snapshot."),
        ("CHECKLIST", "The commitments", "Venue, crew, production,\nphotography, budget."),
        ("ITINERARY", "The event day", "Access, crew call, setup,\nrun of show, stop."),
        ("BUDGET", "Approved vs committed", "Partner commitments and\nthe remaining line."),
        ("PARTNERS", "The outside parties", "Venue, caterer,\nproduction, photographer."),
        ("SIGN OFF", "One deliberate action", "In the header, only when\nthe plan holds."),
    ]
    cw_, ch_, gap = 3.86, 1.34, 0.25
    for index, (tag, title, body) in enumerate(tiles):
        cx = ML + (index % 3) * (cw_ + gap)
        cy = 3.46 + (index // 3) * (ch_ + gap)
        last = index == 5
        card(s, cx, cy, cw_, ch_,
             tint=RGBColor(0xFA, 0xF5, 0xF3) if last else RGBColor(0xFB, 0xFA, 0xF6))
        text(s, tag, cx + 0.2, cy + 0.14, cw_ - 0.4, 0.2, size=8, color=INK_FAINT,
             font=MONO, spacing_pt=100)
        text(s, title, cx + 0.2, cy + 0.38, cw_ - 0.4, 0.26, size=12.5, color=INK, bold=True)
        text(s, body, cx + 0.2, cy + 0.68, cw_ - 0.4, 0.6, size=10.5, color=INK_SOFT, line=1.32)
    footer(s, 8)
    notes(s, "The redesign removed a readiness dashboard and a cross-checks panel. Those "
             "concepts still exist; they surface inline where a decision is needed.")

    # ---------------------------------------------------------------- 9 AI
    s = slide_blank(prs); bg(s)
    eyebrow(s, "The AI boundary")
    h2(s, "Proposes, and cannot write.")
    text(s, "Two allowlisted operations", ML, 2.38, 5.4, 0.3, size=14, color=INK, bold=True)
    for i, line in enumerate([
        "extractBrief — structured brief from pasted text,",
        "   every claim carrying a source span",
        "draftRecovery — proposed field changes with",
        "   rationale and sources",
    ]):
        text(s, line, ML + 0.22, 2.78 + i * 0.28, 5.5, 0.26, size=12, color=INK_SOFT)

    text(s, "Rejected, however confident", 7.0, 2.38, 5.6, 0.3, size=14, color=INK, bold=True)
    for i, line in enumerate([
        "a vendor confirmation no source asserts",
        "attribution to someone who didn't say it",
        "any change to status, readiness or budget",
        "instructions embedded in uploaded material",
    ]):
        text(s, "— " + line, 7.0, 2.78 + i * 0.28, 5.6, 0.26, size=12, color=INK_SOFT)

    hline(s, ML, 4.44, CW)
    text(s, "Output lands as a proposal with author.kind = \"model\". Adoption is a separate\n"
            "human command with its own expected revision. The model has no channel to the writer.",
         ML, 4.7, 11.2, 0.9, size=13, color=INK_SOFT, line=1.42)
    footer(s, 9)
    notes(s, "The strongest claim here is structural, not policy: there is no code path "
             "from model output to the authoritative record.")

    # ---------------------------------------------------------------- 10 review
    s = slide_blank(prs); bg(s)
    eyebrow(s, "Source review")
    h2(s, "A concern is not a plan change.")
    text(s, "Items arrive from named channels — Gmail, Slack, iMessage, Zoom, Research,\n"
            "Manual — each with a locator and a content digest.",
         ML, 2.26, 10.6, 0.8, size=13.5, color=INK_SOFT, line=1.42)
    text(s, "Reviewing one records a disposition: concern, dismissed, deferred, clarification,\n"
            "resolved. The reviewed item is retained; the plan is untouched.",
         ML, 3.06, 10.8, 0.8, size=13.5, color=INK_SOFT, line=1.42)

    hline(s, ML, 3.96, CW)
    card(s, ML, 4.24, 5.86, 1.5, tint=RGBColor(0xFB, 0xFA, 0xF6))
    text(s, "CONCERN", ML + 0.26, 4.4, 5, 0.22, size=8.5, color=INK_FAINT, font=MONO, spacing_pt=110)
    text(s, "A judgement about a source", ML + 0.26, 4.66, 5.3, 0.26, size=13.5, color=INK, bold=True)
    text(s, "Recorded against the review, with a\nreason and who raised it.",
         ML + 0.26, 5.0, 5.3, 0.6, size=11.5, color=INK_SOFT, line=1.36)

    card(s, 6.92, 4.24, 5.86, 1.5, tint=RGBColor(0xFB, 0xFA, 0xF6))
    text(s, "CHANGE", 7.18, 4.4, 5, 0.22, size=8.5, color=INK_FAINT, font=MONO, spacing_pt=110)
    text(s, "A command against the plan", 7.18, 4.66, 5.3, 0.26, size=13.5, color=INK, bold=True)
    text(s, "Needs an expected revision, produces\na new one, and requires re-assessment.",
         7.18, 5.0, 5.3, 0.6, size=11.5, color=INK_SOFT, line=1.36)

    text(s, "Merging these is how a comment silently becomes a commitment.",
         ML, 5.94, 11, 0.3, size=11, color=INK_FAINT, italic=True)
    footer(s, 10)
    notes(s, "Newest part of the product. The point is that a reviewer's opinion and a "
             "plan amendment have different types.")

    # ---------------------------------------------------------------- 11 defects
    s = slide_blank(prs); bg(s)
    eyebrow(s, "Under pressure")
    h2(s, "Four contract defects found in review, and what each cost.", size=29)
    table(s,
          [("A decision bound to the revision it advances", "Every sign-off stale on write"),
           ("A dependency naming a field that doesn't exist", "A real change silently ignored"),
           ("An oracle listing 3 failures where 5 were true", "A correct engine failing its own tests"),
           ("Recovery asserting values no source stated", "Invented vendor concessions")],
          2.42, col1=6.5, size=12,
          head=("DEFECT", "IF IT HAD SHIPPED"))
    text(s, "Each is now mechanically rejected by the fixture validator. Ten reintroduced\n"
            "defects confirm it — one of them was in the write path, where a rejected\n"
            "change still moved the field it named.",
         ML, 5.42, 11, 1.0, size=12, color=INK_SOFT, line=1.42)
    footer(s, 11)
    notes(s, "Volunteering this is the credibility move. It shows the verification actually "
             "found things rather than confirming what was already believed.")

    # ---------------------------------------------------------------- 12 verification
    s = slide_blank(prs); bg(s)
    eyebrow(s, "Verification")
    h2(s, "What actually runs.")
    text(s, "Python reference — normative", ML, 2.26, 5.4, 0.3, size=13.5, color=INK, bold=True)
    for i, (k, v) in enumerate([("fixtures", "0 errors, 0 warnings"),
                                ("schema", "95 checks"),
                                ("core", "102 checks"),
                                ("oracle", "40 differential"),
                                ("end-to-end", "passes")]):
        text(s, k, ML, 2.68 + i * 0.36, 1.7, 0.24, size=9, color=INK_FAINT, font=MONO, spacing_pt=50)
        text(s, v, ML + 1.8, 2.66 + i * 0.36, 3.4, 0.26, size=12, color=INK_SOFT)

    text(s, "Operator app — shipped", 7.0, 2.26, 5.4, 0.3, size=13.5, color=INK, bold=True)
    for i, (k, v) in enumerate([("self-check", "33 checks"),
                                ("source review", "39 checks"),
                                ("typecheck", "clean"),
                                ("lint", "clean"),
                                ("build", "clean")]):
        text(s, k, 7.0, 2.68 + i * 0.36, 1.75, 0.24, size=9, color=INK_FAINT, font=MONO, spacing_pt=50)
        text(s, v, 8.8, 2.66 + i * 0.36, 3.4, 0.26, size=12, color=INK_SOFT)

    hline(s, ML, 4.72, CW)
    text(s, "The app is a port, so the two behaviours a port most easily loses are pinned\n"
            "by name — and each guard is verified by removing it and watching exactly that check fail.",
         ML, 4.98, 11, 0.8, size=13, color=INK_SOFT, line=1.42)
    footer(s, 12)
    notes(s, "If asked how we know the app matches the spec: the Python side is normative, "
             "and the parity checks fail loudly when a guard is removed.")

    # ---------------------------------------------------------------- 13 limits
    s = slide_blank(prs); bg(s)
    eyebrow(s, "Limits")
    h2(s, "What this does not do.")
    limits = [
        "It does not decide. The model extracts and drafts; a person adopts and signs off.",
        "It does not verify physical reality. It checks records, dates and internal\n"
        "    consistency — permits, accessibility and safety stay with qualified people.",
        "It does not secure multiple users. Contributor roles are simulated and labelled,\n"
        "    and the record lives in the operator's browser.",
        "It does not estimate savings. No comparison against a manual baseline has\n"
        "    been measured.",
        "It does not use real data. Every person, venue and price is fictional.",
    ]
    y = 2.42
    for line in limits:
        text(s, line, ML + 0.16, y, 11.0, 0.62, size=12.5, color=INK_SOFT, line=1.4)
        y += 0.66

    card(s, ML, 5.86, 9.4, 0.52, tint=RGBColor(0xFA, 0xF5, 0xF3), edge=ACCENT, edge_w=1.4)
    text(s, "The scenario is one synthetic launch. A result on it is a result on it.",
         ML + 0.26, 6.03, 9.0, 0.3, size=12, color=ACCENT)
    footer(s, 13)
    notes(s, "Do not soften these. Stating the limits first is what makes the rest "
             "believable.")

    # ---------------------------------------------------------------- 14 close
    s = slide_blank(prs); bg(s)
    eyebrow(s, "Close", y=1.86)
    text(s, "The plan changes.", ML, 2.24, 11.4, 0.86, size=46, color=INK, line=1.06)
    text(s, "The approval should notice.", ML, 3.06, 11.4, 0.86, size=46, color=INK, line=1.06)
    text(s, "Readiness computed from current evidence. Approval recorded by a person\n"
            "against an exact revision. Impact derived from what each commitment\n"
            "actually depends on.",
         ML, 4.06, 10.2, 1.0, size=15, color=INK_SOFT, line=1.42)
    hline(s, ML, 5.28, 9.6)
    for i, (k, v) in enumerate([("reference", "oncuex/  ·  tools/"),
                                ("app", "app/ — Enter, React, TypeScript"),
                                ("spec", "docs/ — four documents, 24 checks")]):
        text(s, k, ML, 5.48 + i * 0.32, 1.5, 0.24, size=9, color=INK_FAINT, font=MONO, spacing_pt=60)
        text(s, v, ML + 1.6, 5.46 + i * 0.32, 8, 0.26, size=11.5, color=INK_SOFT)
    footer(s, 14)
    notes(s, "Stop talking here. Let the last line sit.")

    prs.save(OUT)
    return OUT


if __name__ == "__main__":
    path = build()
    size = os.path.getsize(path)
    print(f"wrote {path} ({size / 1024:.1f} KB)")
