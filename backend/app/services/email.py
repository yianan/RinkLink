from __future__ import annotations

import logging
import smtplib
from datetime import datetime
from email.message import EmailMessage
from email.utils import formataddr

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


ACCESS_TARGET_TYPE_LABELS = {
    "association": "Association Access",
    "team": "Team Staff Access",
    "arena": "Arena Staff Access",
    "guardian_link": "Parent/Guardian Link",
    "player_link": "Player Link",
}

ACCESS_ROLE_LABELS = {
    "association_admin": "Association Admin",
    "arena_admin": "Arena Admin",
    "arena_ops": "Arena Ops",
    "coach": "Coach",
    "manager": "Manager",
    "scheduler": "Scheduler",
    "team_admin": "Team Admin",
}


def _title_case_label(value: str) -> str:
    return " ".join(part[:1].upper() + part[1:] for part in value.replace("_", " ").split() if part)


def _target_type_label(target_type: str) -> str:
    return ACCESS_TARGET_TYPE_LABELS.get(target_type, _title_case_label(target_type))


def _role_label(role: str | None) -> str | None:
    if not role:
        return None
    return ACCESS_ROLE_LABELS.get(role, _title_case_label(role))


def email_enabled() -> bool:
    has_transport = bool(settings.brevo_api_key or settings.smtp_host)
    return bool(has_transport and settings.email_from_address)


def _send_via_brevo_api(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> bool:
    payload = {
        "sender": {
            "email": settings.email_from_address,
            "name": settings.email_from_name,
        },
        "to": [{"email": to_email}],
        "subject": subject,
        "textContent": text_body,
    }
    if html_body:
        payload["htmlContent"] = html_body

    response = httpx.post(
        settings.brevo_api_url,
        headers={
            "accept": "application/json",
            "api-key": settings.brevo_api_key or "",
            "content-type": "application/json",
        },
        json=payload,
        timeout=20.0,
    )
    response.raise_for_status()
    return True


def _send_via_smtp(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> bool:
    message = EmailMessage()
    message["From"] = formataddr((settings.email_from_name, settings.email_from_address or ""))
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    smtp_class = smtplib.SMTP_SSL if settings.smtp_use_ssl else smtplib.SMTP
    with smtp_class(settings.smtp_host, settings.smtp_port, timeout=20) as client:
        if not settings.smtp_use_ssl and settings.smtp_starttls:
            client.starttls()
        if settings.smtp_username:
            client.login(settings.smtp_username, settings.smtp_password or "")
        client.send_message(message)
    return True


def send_email(*, to_email: str, subject: str, text_body: str, html_body: str | None = None) -> bool:
    if not email_enabled():
        logger.warning("Email delivery is not configured; skipping email to %s with subject %s", to_email, subject)
        logger.info(text_body)
        return False

    if settings.brevo_api_key:
        return _send_via_brevo_api(
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
        )

    return _send_via_smtp(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )


def send_invite_email(
    *,
    invite_email: str,
    invite_link: str,
    target_name: str,
    target_type: str,
    role: str | None,
    inviter_email: str,
    expires_at: datetime,
) -> bool:
    role_label = _role_label(role)
    target_label = _target_type_label(target_type)
    expiry_label = expires_at.strftime("%B %d, %Y at %I:%M %p UTC")
    subject = "You have a RinkLink access invite"
    role_line = f"Role: {role_label}\n" if role_label else ""
    text_body = (
        f"{inviter_email} invited you to RinkLink.\n\n"
        f"Target: {target_name}\n"
        f"Access type: {target_label}\n"
        f"{role_line}"
        f"Expires: {expiry_label}\n\n"
        f"Accept the invite here:\n{invite_link}\n"
    )
    role_html = f"<p style=\"margin:0 0 8px\"><strong>Role:</strong> {role_label}</p>" if role_label else ""
    html_body = f"""
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h2 style="margin:0 0 12px">You have a RinkLink access invite</h2>
        <p style="margin:0 0 16px"><strong>{inviter_email}</strong> invited you to RinkLink.</p>
        <p style="margin:0 0 8px"><strong>Target:</strong> {target_name}</p>
        <p style="margin:0 0 8px"><strong>Access type:</strong> {target_label}</p>
        {role_html}
        <p style="margin:0 0 20px"><strong>Expires:</strong> {expiry_label}</p>
        <p style="margin:0 0 24px">
          <a href="{invite_link}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">
            Review invite
          </a>
        </p>
        <p style="margin:0 0 12px">If the button does not work, open this link directly:</p>
        <p style="margin:0"><a href="{invite_link}">{invite_link}</a></p>
      </div>
    """
    return send_email(
        to_email=invite_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )
