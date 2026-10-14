#!/usr/bin/env python3
"""Import the local Python notebook curriculum into the School 84 demo DB.

Usage:
  python3 scripts/seed_python_course.py [notebook-root] > /tmp/school84-python-course.sql
  docker-compose exec -T db psql -U school84 -d school84 -v ON_ERROR_STOP=1 < /tmp/school84-python-course.sql

The notebook root defaults to ../school84-mvp/content/source/python.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "school84-mvp/content/source/python"

CHAPTERS = [
    ("01_basics", "Основы Python"),
    ("02_loops", "Циклы"),
    ("03_collections", "Строки и коллекции"),
    ("04_functions_modules", "Функции и модули"),
    ("05_oop", "Объектно-ориентированное программирование"),
    ("06_errors_debugging", "Ошибки и отладка"),
    ("07_files_data", "Файлы и данные"),
    ("08_project_environment", "Структура проекта и окружение"),
    ("09_testing_quality", "Тестирование и качество кода"),
]

# Two executable tasks for every notebook. Tasks are written for the platform's
# stdin/stdout runner, with hidden examples covering ordinary and edge cases.
TASKS = {
    "01_basics/01_first_lesson/01_text_input_output.ipynb": [
        ("Скажи привет", "Прочитайте имя из входных данных и выведите строку «Привет, имя!».", "name = input()\n# Выведите приветствие\n", [("Аня\n", "Привет, Аня!\n"), ("Sam\n", "Привет, Sam!\n")]),
        ("Карточка знакомства", "В первой строке дано имя, во второй — увлечение. Выведите две строки: «Меня зовут имя.» и «Я люблю увлечение.»", "name = input()\nhobby = input()\n", [("Лёша\nшахматы\n", "Меня зовут Лёша.\nЯ люблю шахматы.\n"), ("Mia\nрисовать\n", "Меня зовут Mia.\nЯ люблю рисовать.\n")]),
    ],
    "01_basics/02_numbers_and_conditions/02_numbers_and_conditions.ipynb": [
        ("Сложи два числа", "Даны два целых числа, каждое на отдельной строке. Выведите их сумму.", "first_number = int(input())\nsecond_number = int(input())\n", [("2\n3\n", "5\n"), ("-4\n10\n", "6\n")]),
        ("Проверка чётности", "Дано целое число. Выведите «Чётное», если оно делится на 2, иначе выведите «Нечётное».", "number = int(input())\n", [("8\n", "Чётное\n"), ("-3\n", "Нечётное\n"), ("0\n", "Чётное\n")]),
    ],
    "02_loops/01_for/03_for_loop_step_by_step.ipynb": [
        ("Сосчитай до N", "Дано натуральное число N. Выведите числа от 1 до N включительно, каждое на новой строке.", "n = int(input())\n", [("3\n", "1\n2\n3\n"), ("1\n", "1\n")]),
        ("Сумма от 1 до N", "Дано целое N. Найдите сумму чисел от 1 до N включительно.", "n = int(input())\ntotal = 0\n", [("5\n", "15\n"), ("1\n", "1\n")]),
    ],
    "02_loops/01_for/for_loop_theory_and_tasks.ipynb": [
        ("Сумма чисел строки", "В первой строке дано N, во второй — N целых чисел через пробел. Выведите сумму.", "n = int(input())\nnumbers = list(map(int, input().split()))\n", [("4\n1 2 3 4\n", "10\n"), ("3\n-2 5 1\n", "4\n")]),
        ("Посчитай положительные", "Дано N, затем N целых чисел. Выведите количество чисел строго больше нуля.", "n = int(input())\nnumbers = list(map(int, input().split()))\n", [("5\n-1 0 4 2 -8\n", "2\n"), ("3\n-1 -2 0\n", "0\n")]),
    ],
    "02_loops/02_while/04_while_and_random.ipynb": [
        ("Шаги до нуля", "Дано положительное число N. Выведите N, N−1, …, 1 и затем 0, каждое на новой строке.", "n = int(input())\n", [("3\n", "3\n2\n1\n0\n"), ("1\n", "1\n0\n")]),
        ("Сумма цифр", "Дано неотрицательное целое число. Найдите сумму его цифр с помощью цикла.", "number = int(input())\ntotal = 0\n", [("507\n", "12\n"), ("0\n", "0\n"), ("1234\n", "10\n")]),
    ],
    "03_collections/01_lists/lesson_05_lists.ipynb": [
        ("Первый и последний", "Даны числа через пробел. Выведите первое и последнее число через пробел.", "numbers = list(map(int, input().split()))\n", [("4 8 15 16\n", "4 16\n"), ("7\n", "7 7\n")]),
        ("Разверни список", "Даны числа через пробел. Выведите их в обратном порядке через пробел.", "numbers = list(map(int, input().split()))\n", [("1 2 3\n", "3 2 1\n"), ("5\n", "5\n")]),
    ],
    "03_collections/01_lists/lesson_06_lists_loops_comprehensions.ipynb": [
        ("Только чётные", "Даны целые числа через пробел. Выведите все чётные числа в исходном порядке через пробел. Если их нет, выведите пустую строку.", "numbers = list(map(int, input().split()))\n", [("1 2 3 4 6\n", "2 4 6\n"), ("1 3 5\n", "\n")]),
        ("Квадраты чисел", "Даны целые числа через пробел. Выведите квадраты этих чисел через пробел.", "numbers = list(map(int, input().split()))\n", [("2 -3 4\n", "4 9 16\n"), ("0\n", "0\n")]),
    ],
    "03_collections/02_strings/lesson_strings_methods.ipynb": [
        ("Очисти и нормализуй", "Дана строка. Удалите пробелы по краям и выведите её строчными буквами.", "text = input()\n", [("  PyThOn  \n", "python\n"), ("School 84\n", "school 84\n")]),
        ("Сколько гласных?", "Дана строка латинскими буквами. Посчитайте гласные a, e, i, o, u, y без учёта регистра.", "text = input().lower()\n", [("Education\n", "5\n"), ("rhythm\n", "1\n")]),
    ],
    "03_collections/03_tuples_dicts_sets/lesson_tuples_dicts_sets.ipynb": [
        ("Частота слова", "В первой строке дан список слов через пробел, во второй — слово. Выведите, сколько раз оно встретилось.", "words = input().split()\ntarget = input()\n", [("кот пёс кот кот\nкот\n", "3\n"), ("red blue\ngreen\n", "0\n")]),
        ("Уникальные значения", "Даны целые числа через пробел. Выведите количество различных значений.", "numbers = input().split()\n", [("1 2 2 3 1\n", "3\n"), ("7 7 7\n", "1\n")]),
    ],
    "04_functions_modules/lesson_07_functions_and_modules.ipynb": [
        ("Функция суммы", "Напишите функцию sum_two(a, b), а затем прочитайте два числа и выведите результат её вызова.", "def sum_two(a, b):\n    # Верните сумму\n    pass\n\nfirst = int(input())\nsecond = int(input())\nprint(sum_two(first, second))\n", [("2\n3\n", "5\n"), ("-4\n10\n", "6\n")]),
        ("Функция приветствия", "Напишите функцию greet(name), которая возвращает строку «Привет, имя!». Прочитайте имя и выведите результат.", "def greet(name):\n    # Верните приветствие\n    pass\n\nprint(greet(input()))\n", [("Аня\n", "Привет, Аня!\n"), ("Sam\n", "Привет, Sam!\n")]),
    ],
    "04_functions_modules/lesson_functions_arguments_scope.ipynb": [
        ("Цена со скидкой", "Напишите функцию discounted_price(price, percent=0), возвращающую цену после скидки в процентах. На входе цена и процент.", "def discounted_price(price, percent=0):\n    # Верните цену со скидкой\n    pass\n\nprice = float(input())\npercent = float(input())\nprint(discounted_price(price, percent))\n", [("100\n15\n", "85.0\n"), ("80\n0\n", "80.0\n")]),
        ("Область видимости", "Напишите функцию make_label(name, prefix='Ученик'), которая возвращает строку «prefix: name». На входе имя и префикс.", "def make_label(name, prefix='Ученик'):\n    # Верните подпись\n    pass\n\nname = input()\nprefix = input()\nprint(make_label(name, prefix))\n", [("Ира\nГруппа\n", "Группа: Ира\n"), ("Ира\nУченик\n", "Ученик: Ира\n")]),
    ],
    "05_oop/lesson_08_oop_basics.ipynb": [
        ("Класс приветствия", "Создайте класс Student с атрибутом name и методом greet(), который возвращает «Привет, имя!». Прочитайте имя.", "class Student:\n    def __init__(self, name):\n        self.name = name\n\n    def greet(self):\n        # Верните приветствие\n        pass\n\nstudent = Student(input())\nprint(student.greet())\n", [("Оля\n", "Привет, Оля!\n"), ("Max\n", "Привет, Max!\n")]),
        ("Счётчик объектов", "Создайте класс Counter с числом value, равным нулю, и методом add(), увеличивающим value на 1. Прочитайте N и вызовите метод N раз.", "class Counter:\n    def __init__(self):\n        self.value = 0\n\n    def add(self):\n        self.value += 1\n\nn = int(input())\ncounter = Counter()\nfor _ in range(n):\n    counter.add()\nprint(counter.value)\n", [("4\n", "4\n"), ("0\n", "0\n")]),
    ],
    "06_errors_debugging/lesson_errors_debugging.ipynb": [
        ("Безопасное деление", "Прочитайте два числа. Если делитель равен нулю, выведите «На ноль делить нельзя», иначе выведите целочисленный результат деления.", "a = int(input())\nb = int(input())\n", [("9\n2\n", "4\n"), ("9\n0\n", "На ноль делить нельзя\n")]),
        ("Проверь ввод", "Дана строка. Если она состоит из цифр, выведите число, увеличенное на 1. Иначе выведите «Ошибка ввода».", "value = input()\n", [("41\n", "42\n"), ("кот\n", "Ошибка ввода\n"), ("0\n", "1\n")]),
    ],
    "07_files_data/lesson_files_csv_json.ipynb": [
        ("Сумма столбца CSV", "Даны целые числа через запятую в одной строке (одна строка данных CSV). Выведите их сумму.", "line = input()\n", [("10,20,30\n", "60\n"), ("-5,5\n", "0\n")]),
        ("Подготовь JSON-значение", "Даны имя и возраст на отдельных строках. Выведите компактную JSON-строку вида {\"name\": \"имя\", \"age\": возраст}.", "import json\nname = input()\nage = int(input())\n", [("Аня\n12\n", '{"name": "Аня", "age": 12}\n'), ("Max\n0\n", '{"name": "Max", "age": 0}\n')]),
    ],
    "08_project_environment/lesson_project_structure_environment.ipynb": [
        ("Модульная функция", "Определите функцию normalize(text), которая убирает пробелы по краям и приводит строку к нижнему регистру. Прочитайте строку и выведите результат.", "def normalize(text):\n    # Верните нормализованный текст\n    pass\n\nprint(normalize(input()))\n", [("  Python  \n", "python\n"), ("School\n", "school\n")]),
        ("Точка входа", "Напишите функцию main(), которая читает число и выводит его квадрат. Вызовите main() в конце программы.", "def main():\n    number = int(input())\n    # Выведите квадрат\n    pass\n\nif __name__ == '__main__':\n    main()\n", [("5\n", "25\n"), ("-3\n", "9\n")]),
    ],
    "09_testing_quality/lesson_testing_quality.ipynb": [
        ("Проверяем границы", "Напишите функцию is_adult(age), которая возвращает True при возрасте от 18 лет включительно и False иначе. Прочитайте возраст и выведите результат.", "def is_adult(age):\n    # Верните True или False\n    pass\n\nprint(is_adult(int(input())))\n", [("18\n", "True\n"), ("17\n", "False\n"), ("0\n", "False\n")]),
        ("Среднее значение", "Напишите функцию average(numbers), возвращающую среднее арифметическое непустого списка. В первой строке N, во второй N чисел.", "def average(numbers):\n    # Верните среднее\n    pass\n\nn = int(input())\nnumbers = list(map(float, input().split()))\nprint(average(numbers))\n", [("3\n2 4 6\n", "4.0\n"), ("2\n1 2\n", "1.5\n")]),
    ],
}

QUIZZES = {
    "01_basics/02_numbers_and_conditions/02_numbers_and_conditions.ipynb": ("Что возвращает input()?", ["Всегда целое число", "Строку", "True или False"], 1, "Даже если пользователь ввёл цифры, input() возвращает строку. Для вычислений преобразуйте её через int() или float()."),
    "02_loops/01_for/for_loop_theory_and_tasks.ipynb": ("Какое значение не входит в range(2, 5)?", ["2", "4", "5"], 2, "Правая граница range не включается: будут значения 2, 3 и 4."),
    "02_loops/02_while/04_while_and_random.ipynb": ("Что важно сделать в цикле while, чтобы он завершился?", ["Изменять состояние, влияющее на условие", "Всегда вызывать print()", "Добавить range()"], 0, "Если состояние не меняется и условие остаётся истинным, цикл может стать бесконечным."),
    "03_collections/01_lists/lesson_05_lists.ipynb": ("Какой индекс у последнего элемента списка?", ["len(items)", "len(items) - 1", "1"], 1, "Индексы начинаются с нуля, поэтому индекс последнего элемента равен len(items) - 1."),
    "03_collections/03_tuples_dicts_sets/lesson_tuples_dicts_sets.ipynb": ("Что гарантирует множество set?", ["Сохраняет дубликаты", "Хранит только уникальные значения", "Сортирует элементы по алфавиту"], 1, "Множество хранит уникальные элементы; порядок в нём не следует использовать как сортировку."),
    "04_functions_modules/lesson_07_functions_and_modules.ipynb": ("Зачем функции нужен return?", ["Чтобы вернуть результат вызывающему коду", "Чтобы напечатать текст автоматически", "Чтобы запустить цикл"], 0, "return отдаёт результат. print() только выводит его на экран."),
    "05_oop/lesson_08_oop_basics.ipynb": ("Что такое объект?", ["Конкретный экземпляр класса", "Файл с расширением .py", "Команда цикла"], 0, "Класс задаёт шаблон, а объект — созданный по нему экземпляр с собственными данными."),
    "06_errors_debugging/lesson_errors_debugging.ipynb": ("Какой блок перехватывает ожидаемую ошибку?", ["except", "finally", "import"], 0, "В except указывают исключения, которые программа умеет обработать."),
    "07_files_data/lesson_files_csv_json.ipynb": ("Зачем файл открывают через with open(...) as file?", ["Чтобы файл автоматически закрылся после блока", "Чтобы преобразовать его в список", "Чтобы включить режим отладки"], 0, "Контекстный менеджер закрывает файл даже при возникновении ошибки."),
    "09_testing_quality/lesson_testing_quality.ipynb": ("Какой тестовый случай полезно добавить к обычному примеру?", ["Граничный или пустой вход", "Только тот же вход ещё раз", "Случайный print()"], 0, "Границы и пустые значения часто выявляют ошибки, которые не видны на типичном примере."),
}

LESSON_TITLES = {
    "01_basics/01_first_lesson/01_text_input_output.ipynb": "Текст, ввод и вывод",
    "01_basics/02_numbers_and_conditions/02_numbers_and_conditions.ipynb": "Числа и условия",
    "02_loops/01_for/03_for_loop_step_by_step.ipynb": "Цикл for: основы",
    "02_loops/01_for/for_loop_theory_and_tasks.ipynb": "Цикл for: практика",
    "02_loops/02_while/04_while_and_random.ipynb": "Цикл while",
    "03_collections/01_lists/lesson_05_lists.ipynb": "Списки",
    "03_collections/01_lists/lesson_06_lists_loops_comprehensions.ipynb": "Списки и циклы",
    "03_collections/02_strings/lesson_strings_methods.ipynb": "Методы строк",
    "03_collections/03_tuples_dicts_sets/lesson_tuples_dicts_sets.ipynb": "Кортежи, словари и множества",
    "04_functions_modules/lesson_07_functions_and_modules.ipynb": "Функции и модули",
    "04_functions_modules/lesson_functions_arguments_scope.ipynb": "Аргументы и область видимости",
    "05_oop/lesson_08_oop_basics.ipynb": "Классы и объекты",
    "06_errors_debugging/lesson_errors_debugging.ipynb": "Ошибки и отладка",
    "07_files_data/lesson_files_csv_json.ipynb": "Файлы, CSV и JSON",
    "08_project_environment/lesson_project_structure_environment.ipynb": "Структура проекта и окружение",
    "09_testing_quality/lesson_testing_quality.ipynb": "Тестирование и качество кода",
}


def q(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def ident(path: str, suffix: str) -> str:
    digest = hashlib.sha1(path.encode("utf-8")).hexdigest()[:12]
    return f"py84-{digest}-{suffix}"


def inline_nodes(text: str) -> list[dict]:
    # Preserve the most useful inline Markdown conventions without introducing
    # a second renderer dependency into this one-off local curriculum import.
    token_re = re.compile(r"(`[^`]+`|\*\*.+?\*\*|\*[^*]+\*)")
    nodes = []
    for piece in token_re.split(text):
        if not piece:
            continue
        if piece.startswith("`") and piece.endswith("`"):
            nodes.append({"type": "text", "text": piece[1:-1], "marks": [{"type": "code"}]})
        elif piece.startswith("**") and piece.endswith("**"):
            nodes.append({"type": "text", "text": piece[2:-2], "marks": [{"type": "bold"}]})
        elif piece.startswith("*") and piece.endswith("*"):
            nodes.append({"type": "text", "text": piece[1:-1], "marks": [{"type": "italic"}]})
        else:
            nodes.append({"type": "text", "text": piece})
    return nodes


def markdown_doc(markdown: str) -> dict:
    lines = markdown.splitlines()
    content: list[dict] = []
    paragraph: list[str] = []
    code: list[str] | None = None
    list_kind: str | None = None
    list_items: list[dict] = []

    def flush_paragraph():
        nonlocal paragraph
        if paragraph:
            content.append({"type": "paragraph", "content": inline_nodes(" ".join(x.strip() for x in paragraph))})
            paragraph = []

    def flush_list():
        nonlocal list_kind, list_items
        if list_items:
            content.append({"type": list_kind, "content": list_items})
            list_items = []
            list_kind = None

    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if line.strip().startswith("```"):
            flush_paragraph(); flush_list()
            if code is None:
                code = []
            else:
                content.append({"type": "codeBlock", "content": [{"type": "text", "text": "\n".join(code)}] if code else []})
                code = None
            i += 1
            continue
        if code is not None:
            code.append(line)
            i += 1
            continue
        if not line.strip():
            flush_paragraph(); flush_list(); i += 1; continue
        heading = re.match(r"^(#{1,3})\s+(.*)$", line)
        if heading:
            flush_paragraph(); flush_list()
            content.append({"type": "heading", "attrs": {"level": len(heading.group(1))}, "content": inline_nodes(heading.group(2))})
            i += 1; continue
        if line.lstrip().startswith("!["):
            flush_paragraph(); flush_list()
            alt = re.sub(r"^.*?\[([^]]*)\].*$", r"\1", line.strip())
            if alt:
                content.append({"type": "paragraph", "content": inline_nodes(f"Иллюстрация из блокнота: {alt}")})
            i += 1; continue
        if line.lstrip().startswith(">"):
            flush_paragraph(); flush_list()
            quote_text = re.sub(r"^\s*>\s?", "", line)
            content.append({"type": "blockquote", "content": [{"type": "paragraph", "content": inline_nodes(quote_text)}]})
            i += 1; continue
        bullet = re.match(r"^\s*[-*+]\s+(.*)$", line)
        numbered = re.match(r"^\s*\d+[.)]\s+(.*)$", line)
        if bullet or numbered:
            flush_paragraph()
            kind = "bulletList" if bullet else "orderedList"
            if list_kind and list_kind != kind:
                flush_list()
            list_kind = kind
            item_text = (bullet or numbered).group(1)
            list_items.append({"type": "listItem", "content": [{"type": "paragraph", "content": inline_nodes(item_text)}]})
            i += 1; continue
        if re.match(r"^\s*\|", line):
            flush_list()
            paragraph.append(line.strip().strip("|"))
            i += 1; continue
        paragraph.append(line)
        i += 1
    flush_paragraph(); flush_list()
    if code is not None:
        content.append({"type": "codeBlock", "content": [{"type": "text", "text": "\n".join(code)}] if code else []})
    return {"type": "doc", "content": content or [{"type": "paragraph"}]}


def notebook_material(path: Path) -> tuple[str, list[str]]:
    notebook = json.loads(path.read_text(encoding="utf-8"))
    title = ""
    sequence = []
    for cell in notebook.get("cells", []):
        source = "".join(cell.get("source", [])).strip()
        if not source:
            continue
        if cell.get("cell_type") == "markdown":
            if not title:
                first = re.search(r"^#\s+(.+)$", source, flags=re.M)
                if first:
                    title = first.group(1).strip()
            sequence.append(source)
        elif cell.get("cell_type") == "code":
            sequence.append("```python\n" + source + "\n```")
    material = "\n\n".join(sequence)
    if not title:
        title = path.stem.replace("_", " ")
    # Keep the notebook's sections together as two substantial reading blocks.
    # Prefer a heading boundary near the midpoint, then fall back to paragraphs.
    boundaries = [m.start() for m in re.finditer(r"(?m)^##\s+", material)]
    midpoint = len(material) // 2
    split = min(boundaries, key=lambda p: abs(p - midpoint)) if boundaries else midpoint
    if split < len(material) * 0.25 or split > len(material) * 0.75:
        split = midpoint
    first, second = material[:split].strip(), material[split:].strip()
    return title, [first, second]


def quiz_sql(path_key: str, lesson_id: str, cell_id: str, quiz_data) -> list[str]:
    if not quiz_data:
        return []
    question, answers, correct_index, explanation = quiz_data
    quiz_id = ident(path_key, "quiz")
    question_id = ident(path_key, "question")
    sql = [
        f"INSERT INTO \"Quiz\" (id, \"lessonId\", \"cellId\", \"createdAt\", \"updatedAt\") VALUES ({q(quiz_id)}, NULL, {q(cell_id)}, now(), now()) ON CONFLICT (\"cellId\") DO UPDATE SET \"lessonId\" = NULL, \"updatedAt\" = now();",
        f"INSERT INTO \"QuizQuestion\" (id, \"quizId\", text, type, position) VALUES ({q(question_id)}, {q(quiz_id)}, {q(question)}, 'SINGLE', 1) ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, type = EXCLUDED.type, position = 1;",
    ]
    for index, answer in enumerate(answers):
        answer_id = ident(path_key, f"answer-{index+1}")
        sql.append(
            f"INSERT INTO \"QuizAnswer\" (id, \"questionId\", text, \"isCorrect\", explanation, position) VALUES ({q(answer_id)}, {q(question_id)}, {q(answer)}, {'true' if index == correct_index else 'false'}, {q(explanation) if index == correct_index else 'NULL'}, {index+1}) ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, \"isCorrect\" = EXCLUDED.\"isCorrect\", explanation = EXCLUDED.explanation, position = EXCLUDED.position;"
        )
    return sql


def main():
    files = sorted(ROOT.glob("**/*.ipynb"))
    grouped = {name: [] for name, _ in CHAPTERS}
    for file in files:
        relative = file.relative_to(ROOT).as_posix()
        chapter_key = relative.split("/", 1)[0]
        if chapter_key in grouped and relative in TASKS:
            grouped[chapter_key].append((relative, file))
    missing = set(TASKS) - {file.relative_to(ROOT).as_posix() for file in files}
    if missing:
        raise SystemExit(f"Notebooks not found under {ROOT}: {sorted(missing)}")

    lines = ["BEGIN;", "-- Move existing cells out of the active slots before idempotent reordering.",
             "UPDATE lesson_cell SET position = position + 10000 WHERE \"lessonId\" IN (SELECT l.id FROM \"Lesson\" l JOIN \"CourseChapter\" ch ON ch.id = l.\"chapterId\" WHERE ch.\"courseId\" = 'school84-demo-python');",
             "-- Preserve the demo learner's already-earned sum task while moving it to the numbers lesson.",
             "UPDATE lesson_cell SET position = 999, \"lessonId\" = 'school84-demo-python-lesson' WHERE id = 'school84-demo-python-task-2';",
             "DELETE FROM \"CourseChapter\" WHERE \"courseId\" = 'school84-demo-python' AND id <> 'school84-demo-python-chapter';",
             "DELETE FROM \"Lesson\" WHERE \"chapterId\" = 'school84-demo-python-chapter' AND id <> 'school84-demo-python-lesson';",
             "UPDATE \"Course\" SET title = 'Python с нуля: от первых строк к проектам', description = '{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Пошаговый курс по материалам учебных блокнотов: 9 тем, 16 уроков, короткие конспекты, задачи с автопроверкой и квизы. Изучите основы Python и постепенно соберите навыки для небольших проектов.\"}]}]}', \"smallDesc\" = '16 уроков: конспекты, практика с автопроверкой и квизы', duration = 540, level = 'BEGINNER', status = 'PUBLISHED', \"updatedAt\" = now() WHERE id = 'school84-demo-python';",
             "UPDATE \"Enrollment\" SET \"accessMode\" = 'ALL_AT_ONCE', status = 'Active', \"updatedAt\" = now() WHERE id = 'school84-demo-enrollment';"]
    chapter_positions = {key: index + 1 for index, (key, _) in enumerate(CHAPTERS)}
    total_lessons = total_cells = total_quizzes = 0

    # Retain and relocate the existing passed addition task into the lesson on numbers.
    numbers_lesson_id = ident("01_basics/02_numbers_and_conditions/02_numbers_and_conditions.ipynb", "lesson")
    for chapter_key, chapter_title in CHAPTERS:
        lessons = grouped[chapter_key]
        if not lessons:
            continue
        chapter_id = "school84-demo-python-chapter" if chapter_key == "01_basics" else ident(chapter_key, "chapter")
        if chapter_key != "01_basics":
            lines.append(
                f"INSERT INTO \"CourseChapter\" (id, title, position, \"createdAt\", \"updatedAt\", \"courseId\") VALUES ({q(chapter_id)}, {q(chapter_title)}, {chapter_positions[chapter_key]}, now(), now(), 'school84-demo-python') ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, position = EXCLUDED.position, \"updatedAt\" = now();"
            )
        else:
            lines.append(f"UPDATE \"CourseChapter\" SET title = {q(chapter_title)}, position = {chapter_positions[chapter_key]}, \"updatedAt\" = now() WHERE id = {q(chapter_id)};")

        for lesson_index, (path_key, path) in enumerate(lessons, start=1):
            lesson_title, note_parts = notebook_material(path)
            lesson_title = LESSON_TITLES.get(path_key, lesson_title)
            if path_key == "01_basics/01_first_lesson/01_text_input_output.ipynb":
                lesson_id = "school84-demo-python-lesson"
                lesson_position = 1
            elif path_key == "01_basics/02_numbers_and_conditions/02_numbers_and_conditions.ipynb":
                lesson_id = numbers_lesson_id
                lesson_position = 2
            else:
                lesson_id = ident(path_key, "lesson")
                lesson_position = lesson_index
            lines.append(
                f"INSERT INTO \"Lesson\" (id, title, description, position, \"createdAt\", \"updatedAt\", \"chapterId\") VALUES ({q(lesson_id)}, {q(lesson_title)}, {q('Конспект из учебного блокнота, практика и проверка понимания.')}, {lesson_position}, now(), now(), {q(chapter_id)}) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, position = EXCLUDED.position, \"chapterId\" = EXCLUDED.\"chapterId\", \"updatedAt\" = now();"
            )

            task_defs = TASKS[path_key]
            base_cell_id = {
                "01_basics/01_first_lesson/01_text_input_output.ipynb": "school84-demo-python-text",
            }.get(path_key)
            task_ids = []
            for ti in range(2):
                if path_key == "01_basics/01_first_lesson/01_text_input_output.ipynb" and ti == 0:
                    task_ids.append("school84-demo-python-task-1")
                elif path_key == "01_basics/02_numbers_and_conditions/02_numbers_and_conditions.ipynb" and ti == 0:
                    task_ids.append("school84-demo-python-task-2")
                else:
                    task_ids.append(ident(path_key, f"task-{ti+1}"))
            quiz_data = QUIZZES.get(path_key)
            quiz_cell_id = ident(path_key, "quiz-cell") if quiz_data else None
            cell_specs = [
                (base_cell_id or ident(path_key, "text-1"), 1, "TEXT", "Конспект · часть 1", markdown_doc(note_parts[0]), None),
                (task_ids[0], 2, "CODE_TASK", task_defs[0][0], None, task_defs[0]),
                (ident(path_key, "text-2"), 3, "TEXT", "Конспект · часть 2", markdown_doc(note_parts[1]), None),
                (task_ids[1], 4, "CODE_TASK", task_defs[1][0], None, task_defs[1]),
            ]
            if quiz_data:
                cell_specs.append((quiz_cell_id, 5, "QUIZ", "Проверь себя", None, None))
            for cell_id, position, cell_type, cell_title, text_data, task in cell_specs:
                total_cells += 1
                if cell_type == "TEXT":
                    content = json.dumps(text_data, ensure_ascii=False, separators=(",", ":"))
                    lines.append(
                        f"INSERT INTO lesson_cell (id, \"lessonId\", position, type, title, \"textContent\", \"createdAt\", \"updatedAt\") VALUES ({q(cell_id)}, {q(lesson_id)}, {position}, 'TEXT', {q(cell_title)}, {q(content)}, now(), now()) ON CONFLICT (id) DO UPDATE SET \"lessonId\" = EXCLUDED.\"lessonId\", position = EXCLUDED.position, title = EXCLUDED.title, \"textContent\" = EXCLUDED.\"textContent\", \"updatedAt\" = now();"
                    )
                elif cell_type == "CODE_TASK":
                    title, prompt, starter, cases = task
                    test_cases = json.dumps([{"input": i, "output": o} for i, o in cases], ensure_ascii=False)
                    lines.append(
                        f"INSERT INTO lesson_cell (id, \"lessonId\", position, type, title, \"taskPrompt\", \"starterCode\", \"testCases\", \"lintConfig\", \"createdAt\", \"updatedAt\") VALUES ({q(cell_id)}, {q(lesson_id)}, {position}, 'CODE_TASK', {q(title)}, {q(prompt)}, {q(starter)}, {q(test_cases)}::jsonb, '{{\"python\":[\"ruff\"]}}'::jsonb, now(), now()) ON CONFLICT (id) DO UPDATE SET \"lessonId\" = EXCLUDED.\"lessonId\", position = EXCLUDED.position, title = EXCLUDED.title, \"taskPrompt\" = EXCLUDED.\"taskPrompt\", \"starterCode\" = EXCLUDED.\"starterCode\", \"testCases\" = EXCLUDED.\"testCases\", \"lintConfig\" = EXCLUDED.\"lintConfig\", \"updatedAt\" = now();"
                    )
                else:
                    lines.append(
                        f"INSERT INTO lesson_cell (id, \"lessonId\", position, type, title, \"createdAt\", \"updatedAt\") VALUES ({q(cell_id)}, {q(lesson_id)}, {position}, 'QUIZ', {q(cell_title)}, now(), now()) ON CONFLICT (id) DO UPDATE SET \"lessonId\" = EXCLUDED.\"lessonId\", position = EXCLUDED.position, title = EXCLUDED.title, \"updatedAt\" = now();"
                    )
                    total_quizzes += 1
                    lines.extend(quiz_sql(path_key, lesson_id, cell_id, quiz_data))
            total_lessons += 1

    # Remove the old demo's unused second text/task positions only if present;
    # quiz children and user progress remain tied to their stable cell IDs.
    lines.append("COMMIT;")
    lines.append(f"-- Imported {total_lessons} lessons, {total_cells} ordered cells and {total_quizzes} quizzes from {len(TASKS)} notebooks.")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
