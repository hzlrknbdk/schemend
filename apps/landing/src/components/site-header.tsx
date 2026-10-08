import { Button, ThemeToggle } from "@schemend/ui";
import { Link } from "@tanstack/react-router";
import { Cable, Github, Menu } from "lucide-react";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { dashboardUrl, githubUrl, readmeUrl } from "@/lib/links";

const navLinks = [
	{ label: "How it works", href: "#how-it-works" },
	{ label: "Demo", href: dashboardUrl },
	{ label: "Docs", href: readmeUrl },
];

function Brand() {
	return (
		<Link to="/" className="flex items-center gap-2.5 font-semibold">
			<span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
				<Cable className="size-4" />
			</span>
			<span className="text-lg">Schemend</span>
		</Link>
	);
}

export function SiteHeader() {
	return (
		<header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
			<div className="mx-auto flex h-16 max-w-7xl items-center px-5 sm:px-8">
				<Brand />
				<nav
					className="ml-auto hidden items-center gap-1 md:flex"
					aria-label="Primary navigation"
				>
					<Button asChild variant="ghost" size="sm">
						<a href="#how-it-works">How it works</a>
					</Button>
					<Button asChild variant="ghost" size="sm">
						<a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
							Demo
						</a>
					</Button>
					<Button asChild variant="ghost" size="sm">
						<a href={readmeUrl} target="_blank" rel="noopener noreferrer">
							Docs
						</a>
					</Button>
					<Button asChild variant="outline" size="sm">
						<a href={githubUrl} target="_blank" rel="noopener noreferrer">
							<Github />
							GitHub{" "}
							<span className="font-mono text-2xs text-muted-foreground">
								★ —
							</span>
						</a>
					</Button>
					<ThemeToggle />
				</nav>
				<div className="ml-auto flex items-center gap-1 md:hidden">
					<ThemeToggle />
					<Sheet>
						<SheetTrigger asChild>
							<Button variant="ghost" size="icon" aria-label="Open menu">
								<Menu />
							</Button>
						</SheetTrigger>
						<SheetContent>
							<SheetHeader>
								<SheetTitle>
									<Brand />
								</SheetTitle>
							</SheetHeader>
							<nav className="mt-8 flex flex-col gap-2">
								{navLinks.map((item) => (
									<SheetClose asChild key={item.label}>
										<a
											href={item.href}
											target={item.href.startsWith("#") ? undefined : "_blank"}
											rel={
												item.href.startsWith("#")
													? undefined
													: "noopener noreferrer"
											}
											className="rounded-md px-3 py-3 text-sm font-medium hover:bg-muted"
										>
											{item.label}
										</a>
									</SheetClose>
								))}
								<Button asChild className="mt-3">
									<a href={githubUrl} target="_blank" rel="noopener noreferrer">
										<Github />
										GitHub
									</a>
								</Button>
							</nav>
						</SheetContent>
					</Sheet>
				</div>
			</div>
		</header>
	);
}
