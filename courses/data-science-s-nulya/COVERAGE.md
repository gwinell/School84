# Аудит покрытия источников

Проверяемая версия: 115 уроков SchoolSphere (`manifest.json`). Аудит сравнивает наличие целей, объяснений и практики с нативными учебными единицами источников; он не показывает процент заимствованных файлов, равенство общего объёма заданий или доказанное усвоение.

**Прямое** — есть соответствующая цель, объяснение/пример и практика в курсе. **Частичное** — тема есть, но объём/инструмент/проект источника не воспроизведён. **Нет** — эквивалентная учебная единица не найдена. Для Handbook оценка ориентировочная из-за сопоставления нескольких целей с отдельными notebook.

| Источник и denominator | Прямое | Частичное | Нет | Прямое / включая частичное |
|---|---:|---:|---:|---:|
| UBC modules 0–8 (9 модулей; completion module 9 исключён) | 7 | 2 | 0 | 78% / 100% |
| Microsoft DS for Beginners (20 уроков из README) | 15 | 4 | 1 | 75% / 95% |
| Berkeley Data 8 (18 глав) | 18 | 0 | 0 | 100% / 100% |
| Python Data Science Handbook (64 именованных учебных notebook глав 1–5) | ≈42 | ≈10 | ≈12 | ≈66% / ≈81% |
| mlcourse.ai (10 тем) | 10 | 0 | 0 | 100% / 100% |
| INRIA scikit-learn MOOC (10 модулей учебника) | 10 | 0 | 0 | 100% / 100% |
| ML Zoomcamp (11 недельных блоков) | 5 | 6 | 0 | 45% / 100% |

Эти проценты — доля **учебных единиц по заданному знаменателю**, а не доля всех материалов репозитория. Их нельзя складывать в один итоговый процент: один модуль может включать десятки лекций, notebooks, упражнений, решений и данных, а источники повторяют темы.

## Остаточные различия

- **UBC:** в курсе есть базовый Python и библиотеки для данных. Полноценная практика pytest/unit tests, docstrings/type contracts, formatters, debugger и profiling остаётся частичной.
- **Microsoft:** relational SQL выполняется через встроенный в Python SQLite; NoSQL hands-on, Azure-specific cloud/Azure ML labs, низкокодовый инструмент и несколько больших реальных case studies не воспроизведены полностью. Один из 20 нативных уроков отмечен отсутствующим.
- **Data 8:** все 18 chapter objectives представлены, включая таблицы, симуляции, inference, bootstrap, A/B и Bayes. Это не равно объёму всего учебника и его cumulative problem sets.
- **Handbook:** около 42/64 notebook objectives напрямую представлены; ориентировочно 10 частично, 12 отсутствуют. Остаток: специфические IPython workflows, NumPy structured arrays, часть Pandas further-resource/time-series тем и отдельные notebook-графики. Разбиение приблизительное.
- **mlcourse.ai:** все 10 тематических objectives присутствуют, включая SGD/Vowpal Wabbit, time series и boosting. Полный набор из 51 русскоязычного topic notebook и упражнений не перенесён; Vowpal Wabbit описан как отдельная CLI-зависимость.
- **INRIA:** представлены цели всех 10 модулей и темы pipeline/CV/metrics/models/tuning/feature selection/reduction/clustering. Это не эквивалент 25 notebooks с упражнениями, 25 solutions, datasets и полного количества задач MOOC.
- **Zoomcamp:** 5 из 11 недельных units соответствуют напрямую, 6 частично. Недели deployment усилили локальным Docker + FastAPI, но cloud/production deployment не выполняется; midterm проект и neural-net stack меньше источника; serverless/Kubernetes/KServe остаются обзором без кластера.

**Вывод для заявления о замене.** Курс даёт самостоятельную последовательность по базовым и многим продвинутым целям и не требует внешнего поиска материалов. По единицам целей охват высокий, но полный практический эквивалент всех notebook/упражнений и облачных лабораторных ещё не достигнут. Нельзя называть 100% числом материалов всех репозиториев или фактом обучения.

## Источники и правила счёта

- [UBC modules](https://github.com/UBC-MDS/programming-in-python-for-data-science/tree/master/modules): modules 0–8, module 9 — финальное поздравление.
- [Microsoft README](https://github.com/microsoft/Data-Science-For-Beginners): 20 lesson entries in curriculum table.
- [Data 8 chapters](https://github.com/data-8/textbook/tree/main/chapters): numbered chapters 01–18.
- [Python Data Science Handbook](https://github.com/jakevdp/PythonDataScienceHandbook/tree/master/notebooks): 64 numbered instructional notebooks in chapters 01–05; helper/assets excluded.
- [mlcourse.ai Russian topics](https://github.com/Yorko/mlcourse.ai/tree/main/jupyter_russian): topic01–topic10.
- [INRIA MOOC book](https://github.com/INRIA/scikit-learn-mooc/tree/main/jupyter-book): 10 book modules.
- [ML Zoomcamp](https://github.com/DataTalksClub/machine-learning-zoomcamp): week directories 01–11.
