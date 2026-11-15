/*
 * Void++, a modification for grok.com
 * Copyright (c) 2026 Void++ Contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Flex, Input } from "@components";
import { React } from "@turbopack/common/react";

import { type InputChangeEvent } from "../utils";

interface SearchFilterBarProps<F extends string> {
    placeholder: string;
    search: string;
    onSearchChange(value: string): void;
    filter: F;
    onFilterChange(value: F): void;
    options: readonly { value: F; label: string }[];
}

export function SearchFilterBar<F extends string>({ placeholder, search, onSearchChange, filter, onFilterChange, options }: SearchFilterBarProps<F>) {
    return (
        <Flex alignItems="center" gap="0.75rem">
            <Input
                type="text"
                placeholder={placeholder}
                value={search}
                onChange={(e: InputChangeEvent) => onSearchChange(e.target.value)}
                className="void-search-bar-input"
            />
            <select
                className="void-native-input void-search-bar-select"
                value={filter}
                onChange={(e: InputChangeEvent) => onFilterChange(e.target.value as F)}
            >
                {options.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
        </Flex>
    );
}
