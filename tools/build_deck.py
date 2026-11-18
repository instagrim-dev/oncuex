#!/usr/bin/env python3
"""Generate the OnCueX demo deck as a native PowerPoint file.

Framed as a product solution for the OnCueX business, not as a technical
walkthrough. The structure follows the challenge brief: what the business
does, what was broken, the before-and-after workflow, the business impact,
and how it extends.

    python3 tools/build_deck.py
"""

from __future__ import annotations

import os

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt

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

SHOTS = os.path.join(ROOT, "submission", "screenshots")
_counter = {"n": 0, "total": 0}
TOTAL = 14


def slide_blank(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def bg(slide, color=PAPER):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def spacing(run, hundredths: int) -> None:
    run.font._rPr.set("spc", str(hundredths))


def text(
    slide, s, x, y, w, h, *, size=14, color=INK_SOFT, bold=False, italic=False,
    font=SERIF, spacing_pt=0, line=1.28, align=PP_ALIGN.LEFT,
    anchor=MSO_ANCHOR.TOP, space_after=0,
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
    for index, line_text in enumerate(s.split("\n")):
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


def hline(slide, x, y, w, color=RULE, weight=1.0):
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


def eyebrow(slide, s, y=0.52):
    text(slide, s.upper(), ML, y, CW, 0.26, size=9, color=INK_FAINT,
         font=MONO, spacing_pt=180)


def h2(slide, s, y=1.0, size=32, w=11.6):
    return text(slide, s, ML, y, w, 1.5, size=size, color=INK, line=1.14)


def footer(slide):
    _counter["n"] += 1
    hline(slide, ML, RULE_Y, CW)
    text(slide, "OnCueX", ML, FOOT_Y, 5, 0.22, size=8, color=INK_FAINT,
         font=MONO, spacing_pt=120)
    text(slide, f"{_counter['n']} / {_counter['total']}", SW - ML - 1.6, FOOT_Y,
         1.6, 0.22, size=8, color=INK_FAINT, font=MONO, spacing_pt=120,
         align=PP_ALIGN.RIGHT)


def notes(slide, s):
    slide.notes_slide.notes_text_frame.text = s


def shot(slide, name, x, y, w, *, caption="", frame=True, bottom=6.5):
    path = os.path.join(SHOTS, name)
    if not os.path.exists(path):
        raise FileNotFoundError(f"screenshot missing: {path}")
    from PIL import Image

    with Image.open(path) as im:
        iw, ih = im.size
    caption_h = 0.32 if caption else 0.0
    h = w * ih / iw
    max_h = bottom - y - caption_h
    if h > max_h:
        h = max_h
        w = h * iw / ih
    if frame:
        edge = slide.shapes.add_shape(1, Inches(x - 0.012), Inches(y - 0.012),
                                      Inches(w + 0.024), Inches(h + 0.024))
        edge.fill.background()
        edge.line.color.rgb = RULE
        edge.line.width = Pt(0.75)
        edge.shadow.inherit = False
    slide.shapes.add_picture(path, Inches(x), Inches(y), Inches(w), Inches(h))
    if caption:
        text(slide, caption, x, y + h + 0.09, w, 0.24, size=9, color=INK_FAINT, italic=True)
    return w


def build() -> str:
    prs = Presentation()
    prs.slide_width = Inches(SW)
    prs.slide_height = Inches(SH)
    _counter["total"] = TOTAL

    # ------------------------------------------------------------------ 1 cover
    s = slide_blank(prs); bg(s)
    eyebrow(s, "Converge AI · Stanford · Challenge 01 · Team 17", y=1.62)
    text(s, "Coordinating complex event\ndelivery without losing track\nof what changed.",
         ML, 1.98, 10.6, 2.2, size=40, color=INK, line=1.12)
    text(s, "A working solution for OnCueX, built on Converge.AI.",
         ML, 4.52, 9.4, 0.4, size=17, color=INK_SOFT)
    hline(s, ML, 5.16, 9.0)
    text(s, "Northwind Provisions · 120 guests · 14 March 2027 · $30,000 approved",
         ML, 5.38, 10.4, 0.34, size=12, color=INK_FAINT, italic=True)
    footer(s)
    notes(s, "Open on the business, not the build. OnCueX coordinates complex events; "
             "the thing that breaks is knowing what still holds after a change.")

    # ------------------------------------------------------------------ 2 the business
    s = slide_blank(prs); bg(s)
    eyebrow(s, "About the business")
    h2(s, "What OnCueX actually does.")
    text(s, "OnCueX is a full-service event-marketing company running technology and "
            "innovation events for brands — product launches, hackathons, conferences, "
            "corporate summits. A small core team plans and produces them, coordinating "
            "venues, vendors, exhibitors and special activities.",
         ML, 2.28, 10.9, 1.1, size=14, color=INK_SOFT, line=1.46)
    hline(s, ML, 3.5, CW)
    text(s, "WHY IT IS HARD", ML, 3.72, 5.0, 0.24, size=8.5, color=INK_FAINT,
         font=MONO, spacing_pt=120)
    for i, line in enumerate([
        "Work is spread across scattered documents and tools.",
        "Requirements live in people's heads and inboxes.",
        "One venue change touches access, capacity, crew, cost and permits.",
        "Information is lost as staff turnover and scaling.",
    ]):
        text(s, "— " + line, ML, 4.02 + i * 0.4, 6.1, 0.36, size=12, color=INK_SOFT, line=1.3)
    text(s, "WHAT THEY WANT", 7.0, 3.72, 5.0, 0.24, size=8.5, color=INK_FAINT,
         font=MONO, spacing_pt=120)
    for i, line in enumerate([
        "A scalable approach to complex project management.",
        "On-time delivery inside budget and scope.",
        "No repeated work or missed dependencies.",
        "No accidental oversights after a change.",
    ]):
        text(s, "— " + line, 7.0, 4.02 + i * 0.4, 5.9, 0.36, size=12, color=INK_SOFT, line=1.3)
    footer(s)
    notes(s, "Quote the brief's language back to them: scattered information, knowledge "
             "in heads, decisions slow or inconsistent.")

    # ------------------------------------------------------------------ 3 the problem
    s = slide_blank(prs); bg(s)
    eyebrow(s, "Context & challenge")
    h2(s, "The change is not the problem. The drift is.")
    text(s, "A venue moves. Some commitments lose their support and others do not. "
            "The plan on screen looks the same, and the sign-off given last week "
            "still looks current.",
         ML, 2.26, 10.6, 0.9, size=15, color=INK_SOFT, line=1.44)
    hline(s, ML, 3.46, CW)

    cols = [
        ("WHAT A CHECKLIST SHOWS", "Every task ticked. Nothing about whether the "
         "documents behind them still hold.", RULE),
        ("WHAT A STATUS BADGE SHOWS", "One green word, computed from everything, "
         "explaining nothing.", RULE),
        ("WHAT ONCUEX NEEDS", "Which commitments are still supported, which are not, "
         "and why — before they promise the client.", ACCENT),
    ]
    for i, (head, body, edge) in enumerate(cols):
        x = ML + i * 4.06
        card(s, x, 3.74, 3.82, 1.86,
             tint=RGBColor(0xFA, 0xF5, 0xF3) if i == 2 else RGBColor(0xFB, 0xFA, 0xF6),
             edge=edge, edge_w=1.4 if i == 2 else 0.75)
        text(s, head, x + 0.22, 3.92, 3.4, 0.24, size=8, color=INK_FAINT,
             font=MONO, spacing_pt=100)
        text(s, body, x + 0.22, 4.22, 3.4, 1.2, size=11.5, color=INK_SOFT, line=1.36)
    text(s, "The failure is silence: the plan stops being true and nobody is told which part.",
         ML, 5.86, 11.6, 0.3, size=11, color=INK_FAINT, italic=True)
    footer(s)
    notes(s, "This is the business risk in one line. Not that changes happen — that the "
             "record does not notice.")

    # ------------------------------------------------------------------ 4 before / after
    s = slide_blank(prs); bg(s)
    eyebrow(s, "The workflow, before and after")
    h2(s, "Same change. Two different mornings.", size=29)

    text(s, "BEFORE", ML, 2.16, 5.0, 0.24, size=8.5, color=INK_FAINT, font=MONO, spacing_pt=120)
    for i, line in enumerate([
        "Venue moves. A colleague posts in a channel.",
        "Someone greps four documents for the old times.",
        "Two commitments are missed; one is fine but re-checked anyway.",
        "The client hears the new plan before the team knows the cost moved.",
        "The approval from last week is still in the deck.",
    ]):
        text(s, "— " + line, ML, 2.46 + i * 0.5, 5.8, 0.46, size=11.5, color=INK_SOFT, line=1.32)

    hline(s, 6.86, 2.26, 0.8, ACCENT, 2.0)

    text(s, "AFTER", 7.7, 2.16, 5.0, 0.24, size=8.5, color=ACCENT, font=MONO, spacing_pt=120)
    for i, line in enumerate([
        "The venue change is adopted as one reviewed command.",
        "Six commitments go stale with stated reasons; one stays valid.",
        "The budget flags the overrun on the same screen.",
        "The old sign-off becomes history, not current acceptance.",
        "The next decision cannot be made until the plan holds again.",
    ]):
        text(s, "— " + line, 7.7, 2.46 + i * 0.5, 5.0, 0.46, size=11.5, color=INK_SOFT, line=1.32)

    text(s, "Five minutes of one person's attention, instead of four people re-reading documents.",
         ML, 5.56, 11.6, 0.3, size=11.5, color=INK_FAINT, italic=True)
    footer(s)
    notes(s, "Read both columns. The after column is the product; the before column is "
             "what they do today.")

    # ------------------------------------------------------------------ 5 impact, shown
    s = slide_blank(prs); bg(s)
    eyebrow(s, "The same change, on screen")
    h2(s, "Six commitments reopen. The photographer does not.", size=28)
    text(s, "Impact is computed from what each commitment actually depends on, so "
            "unrelated work stays untouched — and stays signed off.",
         ML, 2.12, 10.8, 0.6, size=12.5, color=INK_SOFT, line=1.4)
    shot(s, "shot-impact-rows.png", ML, 2.78, 11.9,
         caption="After the venue move — six commitments to revisit; photography, bottom row, still valid")
    footer(s)
    notes(s, "Full width so the row states are readable from the back of a room. The "
             "photography row staying green is the point: that is selective impact, not "
             "a blanket reset.")

    # ------------------------------------------------------------------ 6 plain language
    s = slide_blank(prs); bg(s)
    eyebrow(s, "How it reads to a planner")
    h2(s, "It says why, in the words of the plan.", size=29)
    text(s, "No score, no confidence band. A named row, the two values that disagree, "
            "and the fix offered inline.",
         ML, 2.14, 10.4, 0.6, size=12.5, color=INK_SOFT, line=1.4)
    shot(s, "shot-itinerary.png", ML, 2.84, 9.55,
         caption="Itinerary after the move — access ends 07:30, crew arrives 07:15")
    card(s, 10.5, 2.84, 2.22, 2.44, tint=RGBColor(0xFA, 0xF5, 0xF3), edge=ACCENT, edge_w=1.4)
    text(s, "WHAT A PRODUCER SEES", 10.66, 2.98, 1.95, 0.4, size=7.5, color=INK_FAINT,
         font=MONO, spacing_pt=80)
    text(s, "The conflict.\n\nThe fix.\n\nOne click, and\nthe plan is\nre-checked.",
         10.66, 3.44, 1.95, 1.7, size=10.5, color=INK_SOFT, line=1.34)
    text(s, "A planner does not narrate how the seating plan works. They show the plan and flag the one table that does not fit.",
         ML, 6.24, 11.8, 0.3, size=10.5, color=INK_FAINT, italic=True)
    footer(s)
    notes(s, "The brief asked for a planner's binder, not a compliance console. This is "
             "that sentence made visible.")

    # ------------------------------------------------------------------ 7 the decision
    s = slide_blank(prs); bg(s)
    eyebrow(s, "Human control")
    h2(s, "The system never approves anything.", size=30)
    text(s, "Readiness is computed. Acceptance is recorded — by a named event lead, "
            "against one exact revision of the plan.",
         ML, 2.24, 10.6, 0.6, size=14.5, color=INK_SOFT, line=1.42)
    card(s, ML, 3.0, 5.86, 1.9, tint=RGBColor(0xFB, 0xFA, 0xF6))
    text(s, "COMPUTED", ML + 0.28, 3.18, 5.2, 0.22, size=8, color=INK_FAINT,
         font=MONO, spacing_pt=100)
    text(s, "Readiness", ML + 0.28, 3.44, 5.2, 0.28, size=14, color=INK, bold=True)
    text(s, "Supported, outdated, blocked or missing — each with a reason.\n"
            "Recomputed on every read. A checked task never upgrades it.",
         ML + 0.28, 3.78, 5.3, 0.95, size=11, color=INK_SOFT, line=1.36)
    card(s, 6.92, 3.0, 5.86, 1.9, tint=RGBColor(0xFB, 0xF6, 0xF5), edge=ACCENT, edge_w=1.2)
    text(s, "RECORDED", 7.2, 3.18, 5.2, 0.22, size=8, color=ACCENT, font=MONO, spacing_pt=100)
    text(s, "Sign-off", 7.2, 3.44, 5.2, 0.28, size=14, color=INK, bold=True)
    text(s, "One deliberate action in the header, available only when the plan\n"
            "holds. It binds the revision and becomes history when facts move.",
         7.2, 3.78, 5.3, 0.95, size=11, color=INK_SOFT, line=1.36)
    hline(s, ML, 5.16, CW)
    text(s, "A status badge can never impersonate a person.",
         ML, 5.4, 10, 0.36, size=16, color=ACCENT, italic=True)
    footer(s)
    notes(s, "If judges ask who is accountable: the event lead signs, and the product "
             "keeps the signature attached to the facts it covered.")

    # ------------------------------------------------------------------ 8 reviews
    s = slide_blank(prs); bg(s)
    eyebrow(s, "Where information actually arrives")
    h2(s, "A client email is not a plan change.", size=30)
    text(s, "Items arrive from the channels the team already uses — email, Slack, "
            "messages, call notes, research — each with a locator and a content digest.",
         ML, 2.24, 10.8, 0.7, size=13.5, color=INK_SOFT, line=1.42)
    text(s, "Reviewing one records a disposition. The item is kept; the plan is untouched "
            "until someone adopts a change deliberately.",
         ML, 3.06, 10.8, 0.5, size=13.5, color=INK_SOFT, line=1.42)
    hline(s, ML, 3.78, CW)
    card(s, ML, 4.04, 5.86, 1.5, tint=RGBColor(0xFB, 0xFA, 0xF6))
    text(s, "RECORDED AS A CONCERN", ML + 0.26, 4.2, 5.2, 0.22, size=8, color=INK_FAINT,
         font=MONO, spacing_pt=100)
    text(s, "A judgement about a source", ML + 0.26, 4.46, 5.3, 0.26, size=13, color=INK, bold=True)
    text(s, "With a reason, a reviewer and a revisit date.",
         ML + 0.26, 4.8, 5.3, 0.6, size=11, color=INK_SOFT, line=1.34)
    card(s, 6.92, 4.04, 5.86, 1.5, tint=RGBColor(0xFB, 0xFA, 0xF6))
    text(s, "KEPT SEPARATE FROM A CHANGE", 7.18, 4.2, 5.2, 0.22, size=8, color=INK_FAINT,
         font=MONO, spacing_pt=100)
    text(s, "A command against the plan", 7.18, 4.46, 5.3, 0.26, size=13, color=INK, bold=True)
    text(s, "Needs an expected revision; triggers re-assessment.",
         7.18, 4.8, 5.3, 0.6, size=11, color=INK_SOFT, line=1.34)
    text(s, "Merging the two is how a passing comment becomes a commitment.",
         ML, 5.86, 11, 0.3, size=11, color=INK_FAINT, italic=True)
    footer(s)
    notes(s, "This answers the brief's 'information scattered across tools'. It arrives "
             "in one place without pretending a message is an instruction.")

    # ------------------------------------------------------------------ 9 the AI
    s = slide_blank(prs); bg(s)
    eyebrow(s, "AI, bounded")
    h2(s, "It reads the brief. It cannot change the plan.", size=29)
    text(s, "Real model call, one allowlisted path: turn a client brief into a proposed "
            "requirement set, every fact carrying a quote from the source.",
         ML, 2.22, 10.8, 0.7, size=13.5, color=INK_SOFT, line=1.42)
    hline(s, ML, 3.02, CW)
    for i, (head, body) in enumerate([
        ("WHAT IT PRODUCES", "A proposal. Structured, sourced, and inert until someone "
         "adopts it."),
        ("WHAT IT REFUSES", "Confirmation no document states, attribution to the wrong "
         "person, a change to status or budget."),
        ("WHAT IT CANNOT DO", "Write to the plan. There is no code path from model "
         "output to the record."),
    ]):
        x = ML + i * 4.06
        text(s, head, x, 3.28, 3.7, 0.24, size=8, color=INK_FAINT, font=MONO, spacing_pt=100)
        text(s, body, x, 3.58, 3.72, 1.1, size=11.5, color=INK_SOFT, line=1.36)
    card(s, ML, 4.9, 11.6, 0.86, tint=RGBColor(0xFA, 0xF5, 0xF3), edge=ACCENT, edge_w=1.2)
    text(s, "Verified live: a brief was read and returned a sourced requirement set, "
            "inventing nothing and leaving unknowns unknown.",
         ML + 0.28, 5.1, 11.1, 0.5, size=11.5, color=ACCENT)
    footer(s)
    notes(s, "The honest version of 'AI-powered'. It does the reading, which is the slow "
             "part; it does not make the promise.")

    # ------------------------------------------------------------------ 10 impact
    s = slide_blank(prs); bg(s)
    eyebrow(s, "Expected business impact")
    h2(s, "What changes for OnCueX.")
    items = [
        ("Faster, more reliable planning",
         "A moving plan becomes a clear, continuously actionable readiness view."),
        ("Predictable delivery",
         "Recalculated impact across venue, crew, budget and compliance keeps delivery "
         "inside budget and scope."),
        ("Greater operational clarity",
         "A small core team coordinates without repeated research, missed dependencies "
         "or accidental oversights."),
        ("Knowledge that survives turnover",
         "The record holds the source behind every commitment, not the memory of the "
         "person who booked it."),
    ]
    y = 2.3
    for head, body in items:
        card(s, ML, y, 0.05, 0.86, tint=ACCENT, edge=ACCENT, edge_w=0)
        text(s, head, ML + 0.28, y + 0.02, 4.4, 0.3, size=13, color=INK, bold=True)
        text(s, body, ML + 0.28, y + 0.34, 10.9, 0.5, size=11.5, color=INK_SOFT, line=1.36)
        y += 1.06
    text(s, "Observed on one synthetic launch, not measured against OnCueX's own records.",
         ML, 6.3, 11.4, 0.3, size=10.5, color=INK_FAINT, italic=True)
    footer(s)
    notes(s, "Say the measurement caveat out loud. One rehearsal is not a business case, "
             "and claiming savings without a baseline would be the first thing a judge "
             "discounts.")

    # ------------------------------------------------------------------ 11 extendability
    s = slide_blank(prs); bg(s)
    eyebrow(s, "How it extends")
    h2(s, "Built to fit their workflow, not ours.", size=30)
    steps = [
        ("1", "Read-only imports", "Pull the sources OnCueX already uses — email, "
         "drive, project tools — into the review queue."),
        ("2", "Authenticated contributors", "Give the producing team real identities "
         "and scoped roles, replacing the simulated ones."),
        ("3", "Tune the dependency graph", "Widen or narrow what a change touches so "
         "routine edits stop reopening the whole plan."),
        ("4", "Pilot on real projects", "Measure time to a supportable plan across "
         "several events before claiming capacity gains."),
    ]
    y = 2.3
    for n, head, body in steps:
        text(s, n, ML, y, 0.4, 0.4, size=13, color=ACCENT, font=MONO, bold=True)
        text(s, head, ML + 0.52, y - 0.02, 3.5, 0.3, size=12.5, color=INK, bold=True)
        text(s, body, ML + 4.2, y - 0.02, 7.4, 0.56, size=11.5, color=INK_SOFT, line=1.36)
        y += 0.76
    hline(s, ML, 5.42, CW)
    text(s, "What is already generic: the record shape, the assessment vocabulary and the "
            "impact model are not event-specific. The scenario, requirements and sources are.",
         ML, 5.64, 11.6, 0.7, size=11.5, color=INK_SOFT, line=1.4)
    footer(s)
    notes(s, "The brief's example asks that replaceable pieces depend on project knowledge, "
             "not code. That is the schema/fixture split: swapping the scenario needs no "
             "engine change.")

    # ------------------------------------------------------------------ 12 what ships
    s = slide_blank(prs); bg(s)
    eyebrow(s, "What ships today")
    h2(s, "Deployed, not a prototype on a laptop.", size=30)
    text(s, "Live application on Enter. No account, no credentials, no local setup.",
         ML, 2.2, 10.4, 0.4, size=13.5, color=INK_SOFT)
    card(s, ML, 2.86, 6.5, 1.06, tint=RGBColor(0xFB, 0xFA, 0xF6))
    text(s, "LIVE APPLICATION", ML + 0.26, 3.0, 6.0, 0.22, size=8, color=INK_FAINT,
         font=MONO, spacing_pt=100)
    text(s, "d606ece3407d419a80272571af62bfd2.prod.enter.pro",
         ML + 0.26, 3.26, 6.1, 0.3, size=11, color=ACCENT, font=MONO)
    text(s, "Tap through: Overview → Event settings → Move the venue → Checklist.",
         ML + 0.26, 3.58, 6.0, 0.28, size=10, color=INK_FAINT, italic=True)
    shot(s, "shot-overview.png", 7.4, 2.86, 4.86,
         caption="Live now — the launch, as the lead sees it")
    rows = [
        ("Five tabs built for the event", "Overview, Checklist, Itinerary, Budget, Partners"),
        ("Real persistence and export", "Reload and export keep decisions and their currentness"),
        ("Real model call", "Brief extraction, sourced and validated"),
        ("Source review", "Client input recorded without touching the plan"),
    ]
    y = 4.34
    for head, body in rows:
        text(s, head, ML, y, 4.0, 0.26, size=11.5, color=INK, bold=True)
        text(s, body, ML + 4.2, y, 7.4, 0.26, size=11, color=INK_SOFT)
        y += 0.46
    footer(s)
    notes(s, "Walk through it live here if time allows. Everything on this slide is "
             "observable in the deployed app.")

    # ------------------------------------------------------------------ 13 limits
    s = slide_blank(prs); bg(s)
    eyebrow(s, "What this is not")
    h2(s, "The honest boundary.", size=32)
    for i, line in enumerate([
        "It does not decide. The model reads and drafts; the event lead signs off.",
        "It does not verify reality. It compares records, dates and internal consistency — "
        "permits, accessibility and safety stay with qualified people.",
        "It is not multi-user yet. Roles are simulated and the record lives in the "
        "browser; a pilot needs real identity and shared storage.",
        "It does not claim savings. One synthetic launch was exercised, not a client's "
        "portfolio of events.",
        "It is not wired to their CRM. That integration is step one of the pilot path, "
        "not a shipped feature.",
    ]):
        text(s, "— " + line, ML, 2.4 + i * 0.78, 11.4, 0.7, size=12, color=INK_SOFT, line=1.38)
    card(s, ML, 6.06, 9.6, 0.5, tint=RGBColor(0xFA, 0xF5, 0xF3), edge=ACCENT, edge_w=1.2)
    text(s, "A pilot decides whether this helps OnCueX. This demo does not.",
         ML + 0.26, 6.22, 9.2, 0.3, size=11.5, color=ACCENT)
    footer(s)
    notes(s, "Judges trust the boundary more than the promise. Do not soften any line here.")

    # ------------------------------------------------------------------ 14 close
    s = slide_blank(prs); bg(s)
    eyebrow(s, "Close", y=1.9)
    text(s, "The plan will change.\nThe record should notice.", ML, 2.26, 10.8, 1.8,
         size=38, color=INK, line=1.14)
    text(s, "Readiness computed from current evidence. Sign-off recorded by the event "
            "lead. Impact derived from what each commitment actually depends on.",
         ML, 4.16, 10.2, 0.9, size=14.5, color=INK_SOFT, line=1.44)
    hline(s, ML, 5.24, 9.4)
    for i, (k, v) in enumerate([
        ("live app", "d606ece3407d419a80272571af62bfd2.prod.enter.pro"),
        ("source", "github.com/instagrim-dev/oncuex"),
        ("built on", "Converge.AI · Enter"),
    ]):
        text(s, k, ML, 5.46 + i * 0.34, 1.6, 0.24, size=8.5, color=INK_FAINT,
             font=MONO, spacing_pt=60)
        text(s, v, ML + 1.7, 5.44 + i * 0.34, 8.6, 0.26, size=11, color=INK_SOFT)
    footer(s)
    notes(s, "Stop talking. Let the last line sit, then invite questions about the pilot path.")

    prs.save(OUT)
    return OUT


if __name__ == "__main__":
    path = build()
    print(f"wrote {path} ({os.path.getsize(path) / 1024:.1f} KB)")
