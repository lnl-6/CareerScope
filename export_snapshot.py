"""阶段一（Qoder Sites 只读看板）：把岗位列表导出为静态快照 web/dist/data.json。

用法（项目根目录）：D:/Dev/Python/python.exe web/export_snapshot.py
- 数据库有岗位记录时导出真实快照（dataMode = "live"）。
- 数据库为空时生成示例数据（dataMode = "demo"），页面会明确标注为示例快照。
筛选与 CSV 逻辑在浏览器端实现，规则与 internradar/services/board.py 对齐。
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from internradar import config  # noqa: E402
from internradar.models import (  # noqa: E402
    APPLICATION_STATUS_LABELS,
    COMPANY_NATURE_VALUES,
    DEADLINE_PROXIMITY_VALUES,
)
from internradar.services import board  # noqa: E402

OUTPUT = Path(__file__).resolve().parent / "dist" / "data.json"


def _label_payload(labels: dict[str, board.FieldLabel]) -> dict[str, dict[str, float]]:
    return {
        name: {"accuracy": round(label.accuracy, 4), "nullRate": round(label.null_rate, 4)}
        for name, label in labels.items()
    }


def _row_from_board(row: board.BoardRow) -> dict:
    item = row.internship
    return {
        "id": item.id,
        "company": item.company,
        "position": item.position,
        "location": item.location,
        "positionType": item.position_type,
        "isIntern": bool(item.is_intern),
        "majorRequirements": item.major_requirements,
        "applyLink": item.apply_link,
        "deadline": item.deadline,
        "deadlineRaw": item.deadline_raw,
        "sourceName": item.source_name,
        "sourceUrl": item.source_url,
        "sourceModel": item.source_model,
        "additionalSources": len(item.additional_sources),
        "confidence": round(item.confidence, 4),
        "status": item.status.value if hasattr(item.status, "value") else str(item.status),
        "direction": item.direction,
        "companyNature": item.company_nature,
        "applyStatus": row.apply_status_label,
        "appliedAt": row.application.applied_at.isoformat() if row.application else None,
        "notes": row.application.notes if row.application else None,
        "labels": _label_payload(row.labels),
    }


def _live_snapshot() -> list[dict]:
    rows = board.query_board(board.BoardFilters(include_pending=True))
    return [_row_from_board(row) for row in rows]


def _demo_snapshot() -> list[dict]:
    """示例数据：本地数据库为空时用于预览阶段一页面，不写入数据库。"""
    today = date.today()
    qwen_labels = {
        "deadline": {"accuracy": 0.58, "nullRate": 0.35},
        "location": {"accuracy": 0.64, "nullRate": 0.08},
        "major_requirements": {"accuracy": 0.66, "nullRate": 0.12},
    }
    doubao_labels = {
        "deadline": {"accuracy": 0.52, "nullRate": 0.41},
        "major_requirements": {"accuracy": 0.61, "nullRate": 0.27},
    }
    rows = [
        # company, position, location, position_type, major, deadline, deadline_raw, source, model, confidence,
        # status, direction, nature, apply_status, applied_days_ago, notes
        ("小红书", "推荐算法实习生", "上海", "实习", "计算机、软件工程相关专业", None, "尽快投递", "BOSS直聘",
         "qwen-max-v2", 0.96, "pending_review", "数据科学", "民企", "待投递", None, None),
        ("字节跳动", "数据开发实习生", "北京", "实习", "计算机、统计学相关专业", 4, None, "牛客网",
         "doubao-lite-32k", 0.92, "confirmed", "数据工程", "民企", "已投递", 3, "官网投递，等待笔试通知"),
        ("阿里巴巴", "数据分析实习生", "杭州", "实习", "统计、数学、计算机相关专业", 12, None, "实习僧",
         "qwen-max-v2", 0.95, "confirmed", "数据科学", "民企", "笔试", 5, "已完成在线测评"),
        ("中国电信", "云网运维工程师（校招）", "西安", "校招", "通信工程、计算机相关专业", 11, None, "西电就业信息网",
         "qwen-max-v2", 0.88, "confirmed", "运维", "国企", "待投递", None, None),
        ("中国移动", "大数据平台运维", "成都", "校招", "计算机、电子信息相关专业", 2, "11月16日截止", "西电就业信息网",
         "doubao-lite-32k", 0.93, "confirmed", "运维", "国企", "已投递", 1, None),
        ("西门子", "工业数据科学实习生", "上海", "实习", "自动化、计算机、工业工程相关专业", 16, "2026年11月底", "实习僧",
         "qwen-max-v2", 0.81, "confirmed", "数据科学", "外企", "面试", 7, "一面已约，11月20日"),
        ("招商银行", "数据仓库开发（社招）", "深圳", "社招", "计算机相关专业，3 年以上数仓经验", 7, None, "BOSS直聘",
         "doubao-lite-32k", 0.86, "confirmed", "数据工程", "民企", "待投递", None, None),
        ("国家电网陕西电力", "信息系统运维岗", "西安", "校招", "电气工程、计算机相关专业", 36, None, "西电就业信息网",
         "qwen-max-v2", 0.90, "confirmed", "运维", "国企", "待投递", None, None),
        ("微软", "Software Engineer Intern, Data Platform", "苏州", "实习", "计算机相关专业，英文流利", 28, None, "实习僧",
         "qwen-max-v2", 0.89, "confirmed", "数据工程", "外企", "挂掉", 10, "二面后收到感谢信"),
        ("华为", "数据通信运维工程师", "东莞", "校招", "通信、计算机相关专业", 14, None, "牛客网",
         "doubao-lite-32k", 0.91, "confirmed", "运维", "民企", "Offer", 20, "已发意向书，待确认"),
        ("中国建设银行", "数据分析岗", "武汉", "校招", "统计、金融工程、计算机相关专业", 17, None, "西电就业信息网",
         "qwen-max-v2", 0.87, "confirmed", "数据科学", "国企", "待投递", None, None),
        ("德勤", "数据治理咨询实习生", "北京", "实习", "信息管理、计算机相关专业", 24, None, "实习僧",
         "qwen-max-v2", 0.83, "confirmed", "数据工程", "外企", "待投递", None, None),
        ("美团", "机器学习算法实习生", "北京", "实习", "计算机、人工智能相关专业", None, "长期招聘", "BOSS直聘",
         "doubao-lite-32k", 0.77, "confirmed", "数据科学", "民企", "待投递", None, None),
        ("西安交通大学第一附属医院", "信息中心运维工程师", "西安", "社招", "计算机相关专业，熟悉网络与服务器运维", None,
         "招满为止", "西电就业信息网", "qwen-max-v2", 0.84, "confirmed", "运维", "事业单位", "待投递", None, None),
        ("京东", "数据挖掘实习生", "北京", "实习", "计算机、数学相关专业", -1, "11月13日截止", "牛客网",
         "doubao-lite-32k", 0.79, "confirmed", "数据科学", "民企", "已截止", None, None),
        ("比亚迪", "数据平台开发实习生", "深圳", "实习", "计算机、软件工程相关专业", 10, None, "牛客网",
         "qwen-max-v2", 0.72, "pending_review", "数据工程", "民企", "待投递", None, None),
        ("西安电子科技大学后勤集团", "网络运维助理", "西安", "实习", "计算机、网络工程相关专业", None, None,
         "西电就业信息网", "qwen-max-v2", 0.58, "pending_review", "运维", "事业单位", "待投递", None, None),
    ]
    payload = []
    for index, (company, position, location, position_type, major, deadline_days, deadline_raw,
                source, model, confidence, status, direction, nature, apply_status,
                applied_days_ago, notes) in enumerate(rows):
        deadline = (today + timedelta(days=deadline_days)).isoformat() if deadline_days is not None else None
        payload.append(
            {
                "id": f"demo-{index + 1:02d}",
                "company": company,
                "position": position,
                "location": location,
                "positionType": position_type,
                "isIntern": position_type == "实习",
                "majorRequirements": major,
                "applyLink": None,
                "deadline": deadline,
                "deadlineRaw": deadline_raw,
                "sourceName": source,
                "sourceUrl": "https://example.com/demo",
                "sourceModel": model,
                "additionalSources": 1 if index % 5 == 0 else 0,
                "confidence": confidence,
                "status": status,
                "direction": direction,
                "companyNature": nature,
                "applyStatus": apply_status,
                "appliedAt": (today - timedelta(days=applied_days_ago)).isoformat()
                if applied_days_ago is not None else None,
                "notes": notes,
                "labels": qwen_labels if model == "qwen-max-v2" else doubao_labels,
            }
        )
    return payload


def main() -> None:
    rows = _live_snapshot()
    data_mode = "live"
    if not rows:
        rows = _demo_snapshot()
        data_mode = "demo"
    snapshot = {
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "dataMode": data_mode,
        "meta": {
            "directions": config.load_directions(),
            "locations": sorted({row["location"] for row in rows if row["location"]}),
            "companyNatures": list(COMPANY_NATURE_VALUES),
            "deadlineBuckets": list(DEADLINE_PROXIMITY_VALUES),
            "applyStatusLabels": list(APPLICATION_STATUS_LABELS.values()),
            "pageSize": board.PAGE_SIZE,
            "labelFields": ["deadline", "location", "major_requirements"],
        },
        "rows": rows,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{data_mode}: {len(rows)} rows -> {OUTPUT}")


if __name__ == "__main__":
    main()
