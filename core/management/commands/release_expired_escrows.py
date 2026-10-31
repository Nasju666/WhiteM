"""
Pay sellers for escrows whose auto-release deadline has passed and that were
never confirmed or disputed. Also syncs orders whose escrow was settled
on-chain directly (e.g. the buyer confirmed but the browser closed).

Run periodically, e.g. hourly via cron / Task Scheduler:
    python manage.py release_expired_escrows
On hosts without cron, call POST /api/internal/release-expired/ instead.
"""

from django.core.management.base import BaseCommand

from core.escrow_jobs import release_expired_escrows


class Command(BaseCommand):
    help = "Release expired escrows to sellers and sync settled escrows."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Report only, send nothing.")

    def handle(self, *args, dry_run=False, **options):
        result = release_expired_escrows(dry_run=dry_run)
        for line in result["log"]:
            self.stdout.write(line)
        for line in result["errors"]:
            self.stderr.write(line)
        self.stdout.write(self.style.SUCCESS(
            f"Done. Released {result['released']}, synced {result['synced']}."
        ))
