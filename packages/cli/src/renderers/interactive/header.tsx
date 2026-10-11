import { Box, Text } from "ink";

export interface HeaderProps {
	productName: string;
	version: string;
	consumer: string;
	apis: string[];
	breakingCount: number;
}

export function Header({
	productName,
	version,
	consumer,
	apis,
	breakingCount,
}: HeaderProps) {
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text bold>
				{productName} v{version}
			</Text>
			{apis.length > 0 && (
				<Text>
					{apis.join(", ")} {"->"} {consumer}
					{breakingCount > 0
						? ` (${breakingCount} breaking change${breakingCount === 1 ? "" : "s"})`
						: ""}
				</Text>
			)}
		</Box>
	);
}
