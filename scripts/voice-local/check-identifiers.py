"""Живая регрессия обозначений через Pro. Контекст JSON берётся из приложения."""
import argparse
import json
from pathlib import Path
from agent import parse_tasks

parser = argparse.ArgumentParser()
parser.add_argument('context', type=Path)
args = parser.parse_args()
context = json.loads(args.context.read_text())
cases = [
    ('Напиши короче, ДЗ по физике. Значит, на следующую лабораторную работу у нас лабораторная работа Э сто четыре, и на семинар запиши номера сорок восемь, пятьдесят и пятьдесят один.', ['Э-104', '48', '50', '51']),
    ('По физике на следующую лабораторную работа Э-104, а на следующий семинар номера 48, 50 и 51.', ['Э-104', '48', '50', '51']),
    ('По физике на следующую лабораторную работа Б двенадцать, а на следующий семинар номер сто четыре.', ['Б-12', '104']),
]
for text, expected in cases:
    tasks = parse_tasks({'text': text, 'context': context})['tasks']
    assert len(tasks) == 2, tasks
    lab = next(t for t in tasks if t['deadline']['kind'] == 'lab')
    seminar = next(t for t in tasks if t['deadline']['kind'] == 'seminar')
    assert all(t['subjectId'] == 'phys' for t in tasks), tasks
    assert expected[0] in lab['title'], tasks
    assert all(n in seminar['title'] for n in expected[1:]), tasks
    print(json.dumps({'lab': lab['title'], 'seminar': seminar['title']}, ensure_ascii=False), flush=True)
