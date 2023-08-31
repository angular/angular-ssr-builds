export interface Schema {
    /**
     * The name of the main entry-point file.
     */
    main?: string;
    /**
     * The name of the project.
     */
    project: string;
    /**
     * The name of the root module class.
     */
    rootModuleClassName?: string;
    /**
     * The name of the root module file
     */
    rootModuleFileName?: string;
    /**
     * Skip installing dependency packages.
     */
    skipInstall?: boolean;
}
